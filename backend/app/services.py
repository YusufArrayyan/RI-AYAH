"""Logika domain bersama: parameter aturan, evaluasi subjek, kasus, dan penarikan persetujuan."""
from __future__ import annotations

import json
from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from . import audit, rules
from .access import processing_allowed, user_for_subject
from .models import (
    Case,
    CheckinResponse,
    Consent,
    DataRequest,
    Flag,
    FollowUp,
    Reason,
    Relation,
    RuleVersion,
    Setting,
    Subject,
    User,
    WeeklyIndicator,
)
from .security import decrypt
from .timeutil import utcnow

OPEN_STATUSES = ("baru", "disapa", "ditindaklanjuti", "terlambat", "ditinjau")
YELLOW_DAYS = 7
REMINDER_DAY = 5


def get_setting(db: Session, key: str, default):
    s = db.get(Setting, key)
    return s.value if s else default


def active_params(db: Session) -> dict:
    params = {k: dict(v) for k, v in rules.DEFAULT_PARAMS.items()}
    for rv in db.scalars(select(RuleVersion).where(RuleVersion.status == "aktif")):
        params[rv.rule_id] = dict(rv.params)
    return params


def active_versions(db: Session) -> dict[str, int]:
    return {
        rv.rule_id: rv.version
        for rv in db.scalars(select(RuleVersion).where(RuleVersion.status == "aktif"))
    }


def history_for(db: Session, subject_id: int) -> list[rules.Week]:
    rows = db.scalars(
        select(WeeklyIndicator).where(WeeklyIndicator.subject_id == subject_id).order_by(WeeklyIndicator.week)
    )
    return [rules.Week(r.week, r.kehadiran, r.lms, r.tugas, r.kuis) for r in rows]


def latest_checkin(db: Session, subject_id: int) -> CheckinResponse | None:
    return db.scalars(
        select(CheckinResponse)
        .where(CheckinResponse.subject_id == subject_id)
        .order_by(CheckinResponse.week.desc(), CheckinResponse.id.desc())
        .limit(1)
    ).first()


def checkin_score(c: CheckinResponse | None) -> int | None:
    return int(decrypt(c.score_enc)) if c else None


def filtered_history(db: Session, student: User, history: list[rules.Week]) -> list[rules.Week]:
    """Indikator yang tidak disetujui tidak ikut dibaca: nilainya dibekukan agar tidak memicu."""
    allowed = {ind: processing_allowed(db, student, ind) for ind in rules.IND_ORDER}
    if all(allowed.values()):
        return history
    out = []
    for w in history:
        vals = {ind: (w.get(ind) if allowed[ind] else 0.0) for ind in rules.IND_ORDER}
        out.append(rules.Week(w.week, **vals))
    return out


def effective_history(db: Session, subject_id: int) -> list[rules.Week]:
    """Riwayat yang benar-benar dibaca aturan setelah filter persetujuan."""
    hist = history_for(db, subject_id)
    student = user_for_subject(db, subject_id)
    return filtered_history(db, student, hist) if student is not None else hist


def evaluate_subject(db: Session, subject: Subject, *, help_pressed: bool = False) -> rules.Evaluation | None:
    student = user_for_subject(db, subject.id)
    if student is not None and not any(
        processing_allowed(db, student, dt) for dt in ("kehadiran", "lms", "tugas", "kuis", "checkin")
    ) and not help_pressed:
        return None  # tanpa persetujuan, data tidak diproses
    hist = history_for(db, subject.id)
    if student is not None:
        hist = filtered_history(db, student, hist)
    c = latest_checkin(db, subject.id)
    consented = student is not None and processing_allowed(db, student, "checkin")
    return rules.evaluate(
        hist,
        active_params(db),
        checkin_score=checkin_score(c) if consented else None,
        checkin_consented=consented,
        safety=bool(c and c.safety and consented and c.week == (hist[-1].week if hist else 0)),
        help_pressed=help_pressed,
    )


def homeroom_teacher(db: Session, student: User) -> User | None:
    rel = db.scalars(
        select(Relation).where(
            Relation.student_id == student.id,
            Relation.kind.in_(("wali_kelas", "dosen_pa")),
            Relation.status == "aktif",
        )
    ).first()
    return db.get(User, rel.actor_id) if rel else None


def least_loaded_counselor(db: Session) -> User | None:
    counselors = db.scalars(select(User).where(User.role == "bk", User.active.is_(True))).all()
    if not counselors:
        return None
    loads = {
        uid: n
        for uid, n in db.execute(
            select(Case.owner_id, func.count()).where(Case.status.in_(OPEN_STATUSES)).group_by(Case.owner_id)
        )
    }
    return min(counselors, key=lambda u: (loads.get(u.id, 0), u.id))


def create_flag_and_case(
    db: Session, subject: Subject, ev: rules.Evaluation, *, week: int, created_at: datetime | None = None
) -> Case:
    now = created_at or utcnow()
    versions = active_versions(db)
    flag = Flag(
        subject_id=subject.id,
        week=week,
        zone=ev.zone,
        rule_id=ev.rule_id,
        rule_version=versions.get(ev.rule_id, 1),
        counterfactual=ev.counterfactual,
        created_at=now,
    )
    for i, r in enumerate(ev.reasons):
        flag.reasons.append(
            Reason(rank=i + 1, indicator=r.indicator, text=r.text, detail=r.detail, series=r.series, trigger_from=r.trigger_from)
        )
    db.add(flag)
    db.flush()

    student = user_for_subject(db, subject.id)
    if ev.zone == "merah":
        owner = least_loaded_counselor(db)
        hours = active_params(db)["M1"].get("response_hours", 24)
        due = now + timedelta(hours=hours)
    else:
        route = get_setting(db, "k2_route", {"to": "guru"})["to"]
        if ev.rule_id == "K2" and route == "bk":
            owner = least_loaded_counselor(db)
        else:
            owner = homeroom_teacher(db, student) if student else None
        due = now + timedelta(days=YELLOW_DAYS)
    case = Case(
        flag_id=flag.id,
        subject_id=subject.id,
        zone=ev.zone,
        rule_id=ev.rule_id,
        status="baru",
        owner_id=owner.id if owner else None,
        created_at=now,
        due_at=due,
    )
    db.add(case)
    db.flush()
    db.add(FollowUp(case_id=case.id, actor_id=None, action="dibuat", outcome=f"Aturan {ev.rule_id}", at=now))
    return case


def open_case_for(db: Session, subject_id: int) -> Case | None:
    return db.scalars(
        select(Case)
        .where(Case.subject_id == subject_id, Case.status.in_(OPEN_STATUSES))
        .order_by(Case.zone.desc(), Case.created_at.desc())
    ).first()


def refresh_sla(db: Session) -> None:
    """Kasus yang melewati batas tanpa sapaan menjadi Terlambat (alur 5.3)."""
    now = utcnow()
    late = db.scalars(select(Case).where(Case.status == "baru", Case.due_at < now)).all()
    for c in late:
        c.status = "terlambat"
        db.add(FollowUp(case_id=c.id, action="eskalasi", outcome="Lewat batas, naik ke koordinator BK", at=now))
    if late:
        db.commit()


def sla_info(case: Case) -> dict:
    now = utcnow()
    remaining = case.due_at - now
    hours = remaining.total_seconds() / 3600
    return {
        "due_at": case.due_at.isoformat(),
        "hours_left": round(hours, 1),
        "overdue": hours < 0 and case.status in ("baru", "terlambat"),
        "reminder": case.zone == "kuning" and (now - case.created_at).days >= REMINDER_DAY and case.status == "baru",
    }


def close_open_cases(db: Session, subject_id: int, reason: str, actor: User | None) -> int:
    n = 0
    for c in db.scalars(select(Case).where(Case.subject_id == subject_id, Case.status.in_(OPEN_STATUSES))):
        c.status = "ditutup"
        c.closed_at = utcnow()
        c.closed_reason = reason
        db.add(FollowUp(case_id=c.id, actor_id=actor.id if actor else None, action="tutup", outcome=reason))
        if c.flag_id:
            f = db.get(Flag, c.flag_id)
            if f:
                f.active = False
                f.released_at = utcnow()
        n += 1
    return n


def withdraw_all(db: Session, student: User, actor: User, subject_id: int | None) -> dict:
    """Aturan wajib 14.3.9: penarikan menghentikan pemrosesan seketika dan menutup kasus terbuka."""
    now = utcnow()
    kind_actor = "wali" if actor.role == "wali" else "siswa"
    for dt in ("kehadiran", "lms", "tugas", "kuis", "checkin", "bk_baca_checkin"):
        db.add(Consent(student_id=student.id, data_type=dt, kind="persetujuan", granted=False, actor_id=actor.id, at=now))
        if kind_actor == "siswa":
            db.add(Consent(student_id=student.id, data_type=dt, kind="asen", granted=False, actor_id=actor.id, at=now))
    closed = close_open_cases(db, subject_id, "Persetujuan ditarik", actor) if subject_id else 0
    req = DataRequest(
        student_id=student.id,
        requester_id=actor.id,
        kind="hapus",
        status="diproses",
        detail="Penghapusan dijadwalkan sesuai kebijakan retensi setelah persetujuan ditarik",
        created_at=now,
        due_at=now + timedelta(days=14),
    )
    db.add(req)
    audit.write(db, actor, "tarik_semua_persetujuan", "siswa", student.id, f"{closed} kasus ditutup", commit=False)
    db.commit()
    return {"closed_cases": closed, "deletion_request": req.id}


def follow_ups(db: Session, case_id: int) -> list[dict]:
    rows = db.scalars(select(FollowUp).where(FollowUp.case_id == case_id).order_by(FollowUp.at)).all()
    out = []
    for f in rows:
        actor = db.get(User, f.actor_id) if f.actor_id else None
        out.append(
            {
                "action": f.action,
                "outcome": f.outcome,
                "at": f.at.isoformat(),
                "actor": (actor.title or actor.name) if actor else "Sistem",
            }
        )
    return out


def reasons_json(flag: Flag | None, *, for_role: str) -> list[dict]:
    if flag is None:
        return []
    out = []
    for r in flag.reasons:
        text = r.text
        if r.indicator == "checkin" and for_role == "guru":
            text = "Ada tanda dari check-in."  # tanpa butir atau skor (PRD 4.2)
        detail = r.detail
        if for_role in ("bk", "komite"):
            # Staf membaca kalimat orang ketiga; isinya sama dengan yang dilihat siswa.
            text = (
                text.replace("Kamu menekan", "Siswa menekan")
                .replace("menyangkut keselamatanmu", "menyangkut keselamatan siswa")
                .replace("menunjukkan kamu mungkin", "menunjukkan siswa mungkin")
            )
            detail = detail.replace("menghubungimu", "menghubungi siswa").replace("yang kamu isi", "yang diisi siswa")
        out.append(
            {
                "rank": r.rank,
                "indicator": r.indicator,
                "title": rules.INDICATORS.get(r.indicator, {}).get("label", "Check-in" if r.indicator == "checkin" else "Bantuan"),
                "text": text,
                "detail": detail if not (r.indicator == "checkin" and for_role == "guru") else "Isi check-in hanya terbaca guru BK",
                "series": r.series or [],
                "trigger_from": r.trigger_from,
                "summary": rules.text_summary(r.indicator, r.series) if r.series else None,
            }
        )
    return out


def dumps(o) -> str:
    return json.dumps(o, ensure_ascii=False)
