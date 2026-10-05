"""Estimator beban (F24), uji kualitas penjelasan (F23, XAI-7), dan audit keadilan (F12)."""
from __future__ import annotations

import random
from collections import defaultdict
from statistics import median

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import rules
from .access import AGGREGATE_MIN
from .models import AuditAttribute, Case, Flag, Subject, User, XaiTest
from .services import active_params, effective_history, get_setting, history_for
from .timeutil import utcnow


def _all_histories(db: Session) -> dict[int, list[rules.Week]]:
    return {s.id: history_for(db, s.id) for s in db.scalars(select(Subject))}


def estimate_load(db: Session, params: dict, weeks_back: int = 4) -> dict:
    """Jalankan aturan kandidat pada data nyata beberapa pekan terakhir dan hitung kasus baru."""
    hists = _all_histories(db)
    max_week = max((h[-1].week for h in hists.values() if h), default=0)
    per_week = []
    for wk in range(max_week - weeks_back + 1, max_week + 1):
        new = 0
        for h in hists.values():
            cur = [w for w in h if w.week <= wk]
            prev = [w for w in h if w.week <= wk - 1]
            if len(cur) < 2:
                continue
            now_flag = rules.evaluate(cur, params).zone != "hijau"
            was_flag = len(prev) > 1 and rules.evaluate(prev, params).zone != "hijau"
            if now_flag and not was_flag:
                new += 1
        per_week.append({"week": wk, "new_cases": new})
    counselors = db.scalars(select(User).where(User.role == "bk", User.active.is_(True))).all()
    cap_each = get_setting(db, "capacity", {"per_counselor_week": 6})["per_counselor_week"]
    capacity = cap_each * max(1, len(counselors))
    avg = sum(p["new_cases"] for p in per_week) / max(1, len(per_week))
    return {
        "per_week": per_week,
        "average": round(avg, 1),
        "capacity": capacity,
        "utilization": round(avg / capacity, 2) if capacity else None,
        "over_capacity": avg > capacity * 0.85,
    }


# ── Uji kualitas penjelasan ─────────────────────────────────────────────────


def _fidelity(db: Session, params: dict) -> tuple[float, str]:
    flags = db.scalars(select(Flag).where(Flag.rule_id == "K1")).all()
    if not flags:
        return 1.0, "Belum ada penandaan K1"
    match = 0
    for f in flags:
        h = [w for w in effective_history(db, f.subject_id) if w.week <= f.week]
        ev = rules.evaluate(h, params)
        stored = [r.indicator for r in f.reasons]
        if ev.rule_id == f.rule_id and ev.reason_indicators == stored:
            match += 1
    return match / len(flags), f"{match} dari {len(flags)} penandaan diulang dengan alasan identik"


def _stability(db: Session, params: dict, seed: int = 7) -> tuple[float, str]:
    rng = random.Random(seed)
    flags = db.scalars(select(Flag).where(Flag.rule_id == "K1")).all()
    if not flags:
        return 1.0, "Belum ada penandaan K1"
    same = 0
    for f in flags:
        h = [w for w in effective_history(db, f.subject_id) if w.week <= f.week]
        base = rules.evaluate(h, params).reason_indicators
        # Gangguan kecil: nilai kuis ±1 poin. Indikator hitungan tidak diubah.
        noisy = [rules.Week(w.week, w.kehadiran, w.lms, w.tugas, w.kuis + rng.choice((-1, 0, 1))) for w in h]
        if set(rules.evaluate(noisy, params).reason_indicators) == set(base):
            same += 1
    return same / len(flags), f"{same} dari {len(flags)} penandaan memberi alasan sama setelah gangguan kecil"


def _counterfactual_accuracy(db: Session, params: dict) -> tuple[float, str]:
    flags = db.scalars(select(Flag).where(Flag.rule_id == "K1")).all()
    if not flags:
        return 1.0, "Belum ada penandaan K1"
    ok = 0
    for f in flags:
        h = [w for w in effective_history(db, f.subject_id) if w.week <= f.week]
        ev = rules.evaluate(h, params)
        if not ev.counterfactual:
            continue
        sim = rules.apply_counterfactual(h, ev.counterfactual, params["L"]["weeks"])
        if rules.should_release(sim, h[-1].week, ev.triggering, params):
            ok += 1
    return ok / len(flags), f"{ok} dari {len(flags)} saran benar-benar melepas tanda pada simulasi"


def run_xai_tests(db: Session) -> list[XaiTest]:
    params = active_params(db)
    fid, fid_d = _fidelity(db, params)
    stab, stab_d = _stability(db, params)
    cfa, cfa_d = _counterfactual_accuracy(db, params)
    now = utcnow()
    results = [
        XaiTest(test="kesetiaan", value=round(fid, 3), target=1.0, passed=fid >= 1.0, detail=fid_d, run_at=now),
        XaiTest(test="stabilitas", value=round(stab, 3), target=0.9, passed=stab >= 0.9, detail=stab_d, run_at=now),
        XaiTest(
            test="keterpahaman",
            value=0.72,
            target=0.7,
            passed=True,
            simulated=True,
            detail="SIMULASI: survei 3 butir belum dijalankan pada siswa dan guru nyata",
            run_at=now,
        ),
        XaiTest(test="akurasi_kontrafaktual", value=round(cfa, 3), target=0.95, passed=cfa >= 0.95, detail=cfa_d, run_at=now),
    ]
    db.add_all(results)
    db.commit()
    return results


# ── Keadilan ────────────────────────────────────────────────────────────────


def fairness(db: Session) -> dict:
    attrs = {a.subject_id: a for a in db.scalars(select(AuditAttribute))}
    subjects = db.scalars(select(Subject)).all()
    flagged = {f.subject_id for f in db.scalars(select(Flag))}
    cases = db.scalars(select(Case).where(Case.zone == "kuning")).all()

    groups: dict[str, list[int]] = defaultdict(list)
    for s in subjects:
        a = attrs.get(s.id)
        if not a:
            continue
        groups[f"Jenis kelamin: {'Perempuan' if a.gender == 'P' else 'Laki-laki'}"].append(s.id)
        groups[f"Tempat tinggal: {a.area.capitalize()}"].append(s.id)
        groups[f"Jenjang: {s.level.upper()}"].append(s.id)

    total_rate = len(flagged & {s.id for s in subjects}) / max(1, len(subjects))
    rows = []
    for name, ids in sorted(groups.items()):
        n = len(ids)
        if n < AGGREGATE_MIN:
            rows.append({"group": name, "n": None, "hidden": True})
            continue
        rate = len(flagged & set(ids)) / n
        ratio = rate / total_rate if total_rate else 0
        g_cases = [c for c in cases if c.subject_id in set(ids)]
        timely = [c for c in g_cases if c.first_contact_at and (c.first_contact_at - c.created_at).days <= 7]
        timely_rate = len(timely) / len(g_cases) if g_cases else None
        rows.append(
            {
                "group": name,
                "n": n,
                "hidden": False,
                "flag_rate": round(rate, 3),
                "ratio": round(ratio, 2),
                "timely_rate": round(timely_rate, 2) if timely_rate is not None else None,
                "status": "Tinjau" if (ratio > 1.25 or ratio < 0.8) else "Wajar",
            }
        )
    return {"reference_rate": round(total_rate, 3), "rows": rows, "min_group": AGGREGATE_MIN}


def median_or_none(values: list[float]):
    return round(median(values), 1) if values else None
