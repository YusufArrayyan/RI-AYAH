"""Data contoh berlabel SIMULASI (aturan wajib 14.3.7).

Semua nama, kode, nomor, dan angka di sini fiktif. Zona TIDAK ditulis tangan: seed hanya
membuat riwayat indikator, lalu mesin aturan yang menentukan siapa ditandai. Dengan begitu
uji kesetiaan penjelasan (E4) memeriksa sesuatu yang nyata.

Jalankan ulang dari nol:  python -m app.seed --reset
"""
from __future__ import annotations

import json
import random
import secrets
import sys
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import audit, rules
from .analytics import run_xai_tests
from .db import Base, SessionLocal, engine
from .models import (
    AuditAttribute,
    Case,
    CheckinResponse,
    Consent,
    CounselingNote,
    DataRequest,
    EmergencyContact,
    Flag,
    FollowUp,
    ImportJob,
    Institution,
    Invitation,
    KeyMapping,
    LibraryItem,
    Objection,
    Relation,
    RuleVersion,
    ServiceHours,
    Setting,
    Subject,
    User,
    WeeklyIndicator,
)
from .security import encrypt, hash_password
from .services import create_flag_and_case, effective_history
from .timeutil import utcnow

# Kata sandi akun demo (nilai uji, bukan rahasia produksi). Demo juga bisa masuk tanpa
# kata sandi lewat tombol akun demo di layar masuk; produksi memakai SSO.
DEMO_PASSWORD = "riayah-demo-2026"
WEEKS = 8
RNG = random.Random(20261004)

GIRLS = ["Siti", "Aisyah", "Putri", "Rani", "Dewi", "Intan", "Fitri", "Laila", "Nurul", "Salsa", "Zahra", "Citra", "Ayu", "Maya", "Indah", "Tiara", "Nabila", "Hana", "Kirana", "Wulan", "Anisa", "Dinda", "Sekar", "Mutia"]
BOYS = ["Bagas", "Rizky", "Fadil", "Arif", "Yoga", "Ilham", "Fikri", "Hafiz", "Reza", "Adit", "Galih", "Bima", "Rafi", "Dani", "Farhan", "Iqbal", "Naufal", "Satria", "Hendra", "Akbar", "Rehan", "Fauzan", "Taufik", "Gilang"]
SURNAMES = ["Pratama", "Saputra", "Lestari", "Wibowo", "Kusuma", "Hidayat", "Nugroho", "Rahma", "Santoso", "Permata", "Siregar", "Harahap", "Gunawan", "Utami", "Ramadhan", "Anggraini", "Setiawan", "Maharani"]

CLASSES = [
    ("5A", "sd", 22, "anak"),
    ("8B", "smp", 24, "remaja"),
    ("XI IPA 2", "sma", 26, "remaja"),
    ("XII IPS 1", "sma", 22, "remaja"),
]


def week_start(w: int) -> date:
    """Pekan 8 adalah pekan yang baru selesai; pekan 9 dimulai hari ini."""
    today = date.today()
    monday = today - timedelta(days=today.weekday())
    return monday - timedelta(weeks=WEEKS - w + 1)


def code() -> str:
    return "S-" + secrets.token_hex(2).upper()


_HASHES: dict[str, str] = {}


def _hash(kind: str) -> str:
    """Hash dihitung sekali: akun demo memakai DEMO_PASSWORD, akun lain terkunci (sandi acak)."""
    if kind not in _HASHES:
        _HASHES[kind] = hash_password(DEMO_PASSWORD if kind == "demo" else secrets.token_urlsafe(24))
    return _HASHES[kind]


def mk_user(db: Session, inst: Institution, **kw) -> User:
    kw.pop("password_hash", None)
    locked = not kw["email"].endswith("@demo.riayah.id")
    u = User(institution_id=inst.id, password_hash=_hash("locked" if locked else "demo"), **kw)
    db.add(u)
    db.flush()
    return u


def mk_student(db: Session, inst: Institution, *, name: str, nickname: str, email: str, nis: str, cls: str, level: str, mode: str, birth: date, gender: str) -> tuple[User, Subject]:
    u = mk_user(db, inst, email=email, name=name, nickname=nickname, role="siswa", nis=nis, class_name=cls, level=level, ui_mode=mode, birth_date=birth)
    s = Subject(code=code(), class_name=cls, level=level)
    db.add(s)
    db.flush()
    db.add(KeyMapping(user_id=u.id, subject_id=s.id))
    db.add(AuditAttribute(subject_id=s.id, gender=gender, area=RNG.choice(["kota", "kota", "pinggiran"])))
    return u, s


def series_stable(base: dict) -> list[dict]:
    out = []
    for _ in range(WEEKS):
        out.append(
            {
                "kehadiran": max(0, min(5, base["kehadiran"] - (1 if RNG.random() < 0.12 else 0))),
                "lms": max(0, base["lms"] + RNG.choice([-2, -1, 0, 0, 1, 2])),
                "tugas": max(0, base["tugas"] + (1 if RNG.random() < 0.15 else 0)),
                "kuis": round(min(100, max(40, base["kuis"] + RNG.choice([-4, -2, 0, 2, 3]))), 0),
            }
        )
    return out


def apply_decline(series: list[dict], inds: list[str], from_week: int) -> list[dict]:
    """Buat indikator tertentu memburuk tiap pekan mulai `from_week` (1-indeks)."""
    s = [dict(x) for x in series]
    start = s[from_week - 2]
    for i, ind in enumerate(inds):
        val = start[ind]
        for w in range(from_week - 1, WEEKS):
            if ind == "kehadiran":
                val = max(0, val - 1) if val > 0 else 0
            elif ind == "lms":
                val = max(0, val - RNG.choice([2, 3]))
            elif ind == "tugas":
                val = val + 1
            else:
                val = val - RNG.choice([5, 6, 8])
            s[w][ind] = val
    return s


def grant(db: Session, student: User, actor: User, types: list[str], kind: str, at) -> None:
    for dt in types:
        db.add(Consent(student_id=student.id, data_type=dt, kind=kind, granted=True, actor_id=actor.id, at=at))


def seed(db: Session) -> None:
    now = utcnow()
    inst = Institution(name="Sekolah Terpadu Nusantara (SIMULASI)", kind="sekolah")
    db.add(inst)
    db.flush()

    # ── Staf dan wali ──────────────────────────────────────────────────────
    sari = mk_user(db, inst, email="sari@demo.riayah.id", name="Sari Wulandari, S.Pd.", nickname="Sari", title="Bu Sari", role="guru")
    andi = mk_user(db, inst, email="andi@demo.riayah.id", name="Andi Firmansyah, S.Pd.", nickname="Andi", title="Pak Andi", role="guru")
    dewi = mk_user(db, inst, email="dewi.guru@sekolah.local", name="Dewi Anggraini, S.Pd.", nickname="Dewi", title="Bu Dewi", role="guru")
    rahman = mk_user(db, inst, email="rahman@demo.riayah.id", name="Abdul Rahman, M.Psi.", nickname="Rahman", title="Pak Rahman", role="bk", is_coordinator=True)
    maya = mk_user(db, inst, email="maya@demo.riayah.id", name="Maya Sofia, S.Psi.", nickname="Maya", title="Bu Maya", role="bk")
    teguh = mk_user(db, inst, email="teguh@demo.riayah.id", name="Teguh Prasetyo", nickname="Teguh", title="Mas Teguh", role="admin")
    ratna = mk_user(db, inst, email="ratna@demo.riayah.id", name="Ratna Sari Dewi", nickname="Ratna", title="Bu Ratna", role="admin")
    mk_user(db, inst, email="wulan@demo.riayah.id", name="Dra. Wulan Kartika", nickname="Wulan", title="Bu Wulan", role="pimpinan")
    hasan = mk_user(db, inst, email="hasan@demo.riayah.id", name="Dr. Hasan Basri", nickname="Hasan", title="Dr. Hasan", role="komite")
    mk_user(db, inst, email="lestari@demo.riayah.id", name="Lestari Handayani, S.H.", nickname="Lestari", title="Bu Lestari (DPO)", role="komite")
    rina = mk_user(db, inst, email="rina@demo.riayah.id", name="Rina Marlina", nickname="Rina", title="Ibu Rina", role="wali")

    teacher_of = {"5A": andi, "8B": dewi, "XI IPA 2": sari, "XII IPS 1": sari}

    # ── Siswa demo ─────────────────────────────────────────────────────────
    nadia, s_nadia = mk_student(db, inst, name="Nadia Putri", nickname="Nadia", email="nadia@demo.riayah.id", nis="SIM-0001", cls="XI IPA 2", level="sma", mode="remaja", birth=date(2010, 3, 14), gender="P")
    dimas, s_dimas = mk_student(db, inst, name="Dimas Pratama", nickname="Dimas", email="dimas@demo.riayah.id", nis="SIM-0002", cls="XI IPA 2", level="sma", mode="remaja", birth=date(2010, 1, 9), gender="L")
    eighteen = date.today().replace(year=date.today().year - 18) - timedelta(days=6)
    raka, s_raka = mk_student(db, inst, name="Raka Mahendra", nickname="Raka", email="raka@demo.riayah.id", nis="SIM-0003", cls="XII IPS 1", level="sma", mode="remaja", birth=eighteen, gender="L")
    alya, s_alya = mk_student(db, inst, name="Alya Zahra", nickname="Alya", email="alya@demo.riayah.id", nis="SIM-0004", cls="5A", level="sd", mode="anak", birth=date(2015, 5, 2), gender="P")

    demo_students = {nadia.id: s_nadia, dimas.id: s_dimas, raka.id: s_raka, alya.id: s_alya}
    roster: list[tuple[User, Subject]] = [(nadia, s_nadia), (dimas, s_dimas), (raka, s_raka), (alya, s_alya)]

    nis_n = 5
    for cls, level, count, mode in CLASSES:
        existing = sum(1 for u, _ in roster if u.class_name == cls)
        for _ in range(count - existing):
            g = RNG.random() < 0.5
            first = RNG.choice(GIRLS if g else BOYS)
            name = f"{first} {RNG.choice(SURNAMES)}"
            age = {"sd": 11, "smp": 14, "sma": 16}[level] + (1 if cls.startswith("XII") else 0)
            birth = date(date.today().year - age, RNG.randint(1, 12), RNG.randint(1, 28))
            nis = f"SIM-{nis_n:04d}"
            u, s = mk_student(db, inst, name=name, nickname=first, email=f"{nis.lower()}@siswa.sekolah.local", nis=nis, cls=cls, level=level, mode=mode, birth=birth, gender="P" if g else "L")
            roster.append((u, s))
            nis_n += 1
    db.flush()

    # ── Relasi ─────────────────────────────────────────────────────────────
    for u, _ in roster:
        db.add(Relation(actor_id=teacher_of[u.class_name].id, student_id=u.id, kind="wali_kelas", status="aktif", proposed_by=teguh.id, approved_by=ratna.id))
    db.add(Relation(actor_id=rina.id, student_id=alya.id, kind="wali", status="aktif", proposed_by=teguh.id, approved_by=ratna.id))
    db.add(Relation(actor_id=rina.id, student_id=nadia.id, kind="wali", status="aktif", proposed_by=teguh.id, approved_by=ratna.id))
    # Setiap siswa simulasi memiliki wali; satu relasi wali masih menunggu verifikasi sekolah.
    guardian_of: dict[int, User] = {}
    unverified_student_id = None
    for i, (u, _) in enumerate(r for r in roster if r[0].id not in demo_students):
        g = mk_user(db, inst, email=f"wali.{u.nis.lower()}@wali.sekolah.local", name=f"Orang tua {u.nickname} (SIMULASI)", nickname="Wali", title=f"Orang tua {u.nickname}", role="wali")
        guardian_of[u.id] = g
        pending_v = i == 0
        if pending_v:
            unverified_student_id = u.id
        db.add(Relation(actor_id=g.id, student_id=u.id, kind="wali", status="menunggu_verifikasi" if pending_v else "aktif", proposed_by=teguh.id, approved_by=None if pending_v else ratna.id))
    guardians = [(guardian_of[u.id], u) for u, _ in roster if u.id in guardian_of]
    # Satu usulan relasi oleh Bu Ratna yang menunggu persetujuan 4 mata.
    pending_student = next(u for u, _ in roster if u.class_name == "8B" and u.id not in demo_students)
    db.add(Relation(actor_id=maya.id, student_id=pending_student.id, kind="bk", status="menunggu_persetujuan", proposed_by=ratna.id))

    # ── Aturan ─────────────────────────────────────────────────────────────
    t0 = now - timedelta(days=60)
    db.add_all(
        [
            RuleVersion(rule_id="M1", version=1, params={"response_hours": 24}, status="aktif", reason="Usulan awal dari PRD v1", owner="BK dan psikolog", proposed_by=teguh.id, approved_by=hasan.id, created_at=t0, decided_at=t0),
            RuleVersion(rule_id="K1", version=1, params={"min_indicators": 2, "weeks": 4}, status="arsip", reason="Usulan awal PRD v1", owner="Psikolog, guru, BK", proposed_by=teguh.id, approved_by=hasan.id, created_at=t0, decided_at=t0),
            RuleVersion(rule_id="K1", version=2, params={"min_indicators": 2, "weeks": 3}, status="aktif", reason="Empat pekan terlalu lambat menurut konselor; diturunkan ke tiga pekan", owner="Psikolog, guru, BK", proposed_by=teguh.id, approved_by=hasan.id, created_at=t0 + timedelta(days=20), decided_at=t0 + timedelta(days=22)),
            RuleVersion(rule_id="K2", version=1, params={"threshold": 8, "max": 12}, status="aktif", reason="Placeholder; instrumen belum dipilih", owner="Psikolog", proposed_by=teguh.id, approved_by=hasan.id, created_at=t0, decided_at=t0),
            RuleVersion(rule_id="L", version=1, params={"weeks": 2}, status="aktif", reason="Usulan awal", owner="Psikolog, komite", proposed_by=teguh.id, approved_by=hasan.id, created_at=t0, decided_at=t0),
            RuleVersion(rule_id="K2", version=2, params={"threshold": 9, "max": 12}, status="diajukan", reason="Beban BK di atas 85% dua pekan; usul ambang check-in dinaikkan satu poin sambil menunggu instrumen final", owner="Psikolog", proposed_by=teguh.id, created_at=now - timedelta(days=2)),
        ]
    )
    db.flush()

    # ── Persetujuan ────────────────────────────────────────────────────────
    ind_types = ["kehadiran", "lms", "tugas", "kuis"]
    consent_at = now - timedelta(days=55)
    for u, _ in roster:
        r = RNG.random()
        if u.id in (nadia.id, alya.id, raka.id, dimas.id):
            continue
        if r < 0.08 or u.id == unverified_student_id:
            continue  # tidak ikut, atau wali belum terverifikasi
        types = ind_types + (["checkin"] if r < 0.75 else []) + (["bk_baca_checkin"] if r < 0.45 else [])
        if u.level in ("sd", "smp", "sma"):
            grant(db, u, guardian_of[u.id], types, "persetujuan", consent_at)
            grant(db, u, u, types, "asen", consent_at + timedelta(days=1))
        else:
            grant(db, u, u, types, "persetujuan", consent_at)
    grant(db, nadia, rina, ind_types + ["checkin"], "persetujuan", consent_at)
    grant(db, nadia, nadia, ind_types + ["checkin"], "asen", consent_at + timedelta(days=1))
    grant(db, alya, rina, ind_types + ["checkin"], "persetujuan", consent_at)
    grant(db, alya, alya, ind_types, "asen", consent_at + timedelta(days=2))
    grant(db, dimas, dimas, ind_types + ["checkin", "bk_baca_checkin"], "asen", consent_at)
    g_dimas = mk_user(db, inst, email="wali.dimas@wali.sekolah.local", name="Orang tua Dimas (SIMULASI)", nickname="Wali", title="Orang tua Dimas", role="wali")
    db.add(Relation(actor_id=g_dimas.id, student_id=dimas.id, kind="wali", status="aktif", proposed_by=teguh.id, approved_by=ratna.id))
    grant(db, dimas, g_dimas, ind_types + ["checkin", "bk_baca_checkin"], "persetujuan", consent_at)
    # Raka: persetujuan diberikan wali saat masih 17 → kini perlu konfirmasi ulang (F21).
    g_raka = mk_user(db, inst, email="wali.raka@wali.sekolah.local", name="Orang tua Raka (SIMULASI)", nickname="Wali", title="Orang tua Raka", role="wali")
    db.add(Relation(actor_id=g_raka.id, student_id=raka.id, kind="wali", status="aktif", proposed_by=teguh.id, approved_by=ratna.id))
    grant(db, raka, g_raka, ind_types + ["checkin"], "persetujuan", consent_at)
    grant(db, raka, raka, ind_types + ["checkin"], "asen", consent_at)
    db.flush()

    # ── Indikator mingguan ─────────────────────────────────────────────────
    declines: dict[int, tuple[list[str], int]] = {
        s_nadia.id: (["kehadiran", "lms", "tugas"], 6),
        s_alya.id: (["kehadiran", "tugas"], 6),
    }
    others = [s for u, s in roster if u.id not in demo_students]
    RNG.shuffle(others)
    for s in others[:7]:
        declines[s.id] = (RNG.sample(["kehadiran", "lms", "tugas", "kuis"], 2), 6)
    for s in others[7:12]:
        declines[s.id] = (RNG.sample(["kehadiran", "lms", "tugas", "kuis"], 2), 5)

    for u, s in roster:
        base = {
            "kehadiran": 5 if RNG.random() < 0.8 else 4,
            "lms": RNG.randint(9, 15),
            "tugas": 0 if RNG.random() < 0.7 else 1,
            "kuis": RNG.randint(68, 90),
        }
        series = series_stable(base)
        if s.id == s_nadia.id:
            series = [
                {"kehadiran": 5, "lms": 12, "tugas": 0, "kuis": 82},
                {"kehadiran": 5, "lms": 13, "tugas": 0, "kuis": 80},
                {"kehadiran": 5, "lms": 12, "tugas": 0, "kuis": 84},
                {"kehadiran": 5, "lms": 13, "tugas": 1, "kuis": 81},
                {"kehadiran": 5, "lms": 12, "tugas": 0, "kuis": 83},
                {"kehadiran": 4, "lms": 9, "tugas": 1, "kuis": 80},
                {"kehadiran": 3, "lms": 6, "tugas": 2, "kuis": 82},
                {"kehadiran": 2, "lms": 4, "tugas": 3, "kuis": 79},
            ]
        elif s.id == s_dimas.id:
            series = [{"kehadiran": 5, "lms": 12 + (w % 3), "tugas": 0, "kuis": 84 + (w % 2) * 2} for w in range(WEEKS)]
        elif s.id in declines:
            inds, fw = declines[s.id]
            for ind in inds:
                if ind == "kehadiran":
                    for row in series:
                        row["kehadiran"] = 5
            series = apply_decline(series, inds, fw)
            # Pastikan indikator lain tidak ikut memburuk berturut-turut secara kebetulan.
            for ind in set(rules.IND_ORDER) - set(inds):
                for w in range(fw - 1, WEEKS):
                    series[w][ind] = series[fw - 2][ind]
        for w, row in enumerate(series, start=1):
            db.add(WeeklyIndicator(subject_id=s.id, week=w, week_start=week_start(w), **row))
    db.flush()

    # ── Check-in ───────────────────────────────────────────────────────────
    k2_student = next(s for u, s in roster if u.class_name == "XI IPA 2" and u.id not in demo_students and s.id not in declines)
    k2_user = next(u for u, s in roster if s.id == k2_student.id)
    # Siswa K2 pasti ikut check-in dan mengizinkan BK membaca.
    for dt in ("checkin", "bk_baca_checkin"):
        for kind, actor in (("persetujuan", guardian_of[k2_user.id]), ("asen", k2_user)):
            db.add(Consent(student_id=k2_user.id, data_type=dt, kind=kind, granted=True, actor_id=actor.id, at=consent_at))
    db.flush()

    from .access import processing_allowed

    for u, s in roster:
        if not processing_allowed(db, u, "checkin"):
            continue
        for w in range(5, WEEKS + 1):
            if u.id == nadia.id and w == WEEKS:
                continue  # check-in pekan ini belum diisi
            if RNG.random() < 0.25 and s.id != k2_student.id:
                continue
            if s.id == k2_student.id and w >= 7:
                ans = {"lelah": 3, "fokus": 2, "sendiri": 2, "tidur": 2} if w == WEEKS else {"lelah": 2, "fokus": 2, "sendiri": 1, "tidur": 2}
            else:
                ans = {k: RNG.choice([0, 0, 1, 1, 2]) for k in ("lelah", "fokus", "sendiri", "tidur")}
                if u.id == nadia.id:
                    ans = {"lelah": 2, "fokus": 2, "sendiri": 1, "tidur": 1}
                if sum(ans.values()) >= 8:
                    ans["sendiri"] = 0
            score = sum(ans.values())
            db.add(CheckinResponse(subject_id=s.id, week=w, answers_enc=encrypt(json.dumps({"answers": ans, "safety": False})), score_enc=encrypt(str(score)), safety=False))
    db.flush()

    # ── Settings ───────────────────────────────────────────────────────────
    db.add_all(
        [
            Setting(key="capacity", value={"per_counselor_week": 6, "per_counselor_active": 6}),
            Setting(key="k2_route", value={"to": "guru"}),
            Setting(key="utilization_history", value={"weeks": [0.79, 0.88]}),
        ]
    )
    db.flush()

    # ── Evaluasi aturan → penandaan dan kasus ──────────────────────────────
    from .services import active_params, latest_checkin, checkin_score

    params = active_params(db)
    case_by_subject: dict[int, Case] = {}
    for u, s in roster:
        hist = effective_history(db, s.id)
        if not hist or not any(processing_allowed(db, u, dt) for dt in ("kehadiran", "lms", "tugas", "kuis", "checkin")):
            continue
        # Cari pekan pertama aturan terpenuhi agar tanggal kasus masuk akal.
        first_week = None
        ev_final = None
        for wk in range(4, WEEKS + 1):
            ev = rules.evaluate([h for h in hist if h.week <= wk], params)
            if ev.zone != "hijau":
                first_week, ev_final = wk, ev
                break
        if ev_final is None:
            c = latest_checkin(db, s.id)
            if processing_allowed(db, u, "checkin") and c and c.week == WEEKS:
                ev = rules.evaluate(hist, params, checkin_score=checkin_score(c), checkin_consented=True)
                if ev.zone != "hijau":
                    first_week, ev_final = WEEKS, ev
        if ev_final is None:
            continue
        created = now - (timedelta(days=3, hours=2) if first_week == WEEKS else timedelta(days=9, hours=RNG.randint(1, 20)))
        if s.id == s_alya.id:
            created = now - timedelta(days=2, hours=5)
        # Riwayat hingga pekan pemicu dievaluasi ulang agar alasan identik dengan aturan.
        ev_at = rules.evaluate([h for h in hist if h.week <= first_week], params) if ev_final.rule_id == "K1" else ev_final
        case = create_flag_and_case(db, s, ev_at, week=first_week, created_at=created)
        case_by_subject[s.id] = case

    # ── Variasi status kasus ───────────────────────────────────────────────
    yellow_cases = [c for sid, c in case_by_subject.items() if sid not in (s_nadia.id, s_alya.id, k2_student.id)]
    for i, c in enumerate(yellow_cases):
        owner = db.get(User, c.owner_id) if c.owner_id else None
        if i % 4 == 0:
            c.status = "disapa"
            c.first_contact_at = c.created_at + timedelta(days=RNG.randint(1, 5))
            db.add(FollowUp(case_id=c.id, actor_id=owner.id if owner else None, action="disapa", outcome="Sudah menyapa, siswa ingin cerita lagi", at=c.first_contact_at))
        elif i % 4 == 1 and i < 6:
            c.status = "ditindaklanjuti"
            c.first_contact_at = c.created_at + timedelta(days=2)
            c.owner_id = maya.id
            db.add(FollowUp(case_id=c.id, actor_id=sari.id, action="disapa", outcome="Sudah menyapa, siswa ingin cerita lagi", at=c.first_contact_at))
            db.add(FollowUp(case_id=c.id, actor_id=sari.id, action="teruskan_bk", outcome="Diteruskan ke Bu Maya", at=c.first_contact_at + timedelta(hours=3)))
            db.add(CounselingNote(case_id=c.id, author_id=maya.id, content_enc=encrypt("Sesi pertama: siswa bercerita soal jadwal les yang padat dan kurang tidur. Sepakat menyusun jadwal belajar bersama pekan depan. (SIMULASI)"), label="Perlu sesi lanjutan", at=c.first_contact_at + timedelta(days=1)))
    # Satu keberatan menunggu di XII IPS 1.
    obj_case = next((c for c in yellow_cases if db.get(Subject, c.subject_id).class_name == "XII IPS 1" and c.status == "baru"), None)
    if obj_case is None and yellow_cases:
        obj_case = yellow_cases[-1]
    if obj_case:
        obj_user = next(u for u, s in roster if s.id == obj_case.subject_id)
        obj_case.status = "ditinjau"
        db.add(Objection(case_id=obj_case.id, student_id=obj_user.id, statement="Aku tidak masuk tiga hari karena ikut lomba olahraga mewakili sekolah, ada surat tugasnya. Jadi bukan karena ada masalah.", created_at=now - timedelta(days=4), due_at=now + timedelta(days=10)))
        db.add(FollowUp(case_id=obj_case.id, actor_id=obj_user.id, action="keberatan", outcome="Siswa mengajukan keberatan", at=now - timedelta(days=4)))

    # Kasus merah: satu baru belum ditugaskan, satu sudah ditangani.
    red_subjects = [s for u, s in roster if u.class_name in ("8B", "XII IPS 1") and s.id not in case_by_subject and u.id not in demo_students][:2]
    for idx, s in enumerate(red_subjects):
        r = rules.ReasonOut("bantuan", "Permintaan bantuan", "Kamu menekan tombol “Butuh bantuan sekarang”.", "Guru BK siaga diminta menghubungimu.", [], None, 1.0)
        ev = rules.Evaluation("merah", "M1", [r])
        created = now - (timedelta(hours=3) if idx == 0 else timedelta(days=6))
        c = create_flag_and_case(db, s, ev, week=WEEKS, created_at=created)
        if idx == 0:
            c.owner_id = None
        else:
            c.owner_id = rahman.id
            c.status = "ditindaklanjuti"
            c.first_contact_at = created + timedelta(hours=5)
            db.add(FollowUp(case_id=c.id, actor_id=rahman.id, action="mulai_sesi", outcome="Sesi dimulai", at=c.first_contact_at))
            db.add(CounselingNote(case_id=c.id, author_id=rahman.id, content_enc=encrypt("Kontak telepon 5 jam setelah tombol ditekan. Siswa aman, tinggal bersama kakak. Disepakati sesi tatap muka besok pagi. (SIMULASI)"), label="Sesi pertama selesai", at=c.first_contact_at))
        case_by_subject[s.id] = c
    # Riwayat respons merah lama (ditutup) untuk median waktu respons.
    closed_red = [s for u, s in roster if s.id not in case_by_subject and u.id not in demo_students][:4]
    for i, s in enumerate(closed_red):
        r = rules.ReasonOut("bantuan", "Permintaan bantuan", "Kamu menekan tombol “Butuh bantuan sekarang”.", "Guru BK siaga diminta menghubungimu.", [], None, 1.0)
        created = now - timedelta(days=12 + i * 9)
        c = create_flag_and_case(db, s, rules.Evaluation("merah", "M1", [r]), week=max(1, WEEKS - 2 - i), created_at=created)
        c.owner_id = rahman.id if i % 2 == 0 else maya.id
        c.first_contact_at = created + timedelta(hours=[4, 9, 16, 6][i])
        c.status, c.closed_at, c.closed_reason = "ditutup", created + timedelta(days=5), "Tidak memerlukan tindak lanjut"
        f = db.get(Flag, c.flag_id)
        f.active, f.released_at = False, c.closed_at

    # Nadia: kasus baru dari Bu Sari, belum ditanggapi.
    # Alya: kasus kuning dari Pak Andi dan undangan BK untuk Ibu Rina.
    db.add(
        Invitation(
            student_id=alya.id,
            guardian_id=rina.id,
            counselor_id=rahman.id,
            message="Pak Rahman (guru BK) mengundang Ibu berbincang tentang pendampingan Alya di sekolah. Pertemuan sekitar 30 menit.",
            slots=[
                {"id": "s0", "label": "Rabu · 09.00"},
                {"id": "s1", "label": "Kamis · 13.00"},
                {"id": "s2", "label": "Jumat · 08.30"},
            ],
            created_at=now - timedelta(days=1),
        )
    )

    # ── Permintaan hak data ────────────────────────────────────────────────
    some = [u for u, s in roster if u.id not in demo_students][20:24]
    db.add_all(
        [
            DataRequest(student_id=some[0].id, requester_id=some[0].id, kind="hapus", status="diproses", detail="Siswa pindah sekolah", created_at=now - timedelta(days=5), due_at=now + timedelta(days=9)),
            DataRequest(student_id=some[1].id, requester_id=some[1].id, kind="lihat", status="selesai", created_at=now - timedelta(days=20), due_at=now - timedelta(days=6), done_at=now - timedelta(days=18)),
            DataRequest(student_id=some[2].id, requester_id=some[2].id, kind="perbaiki", status="diajukan", detail="Kehadiran pekan 6 tercatat 2 hari, seharusnya 4 (izin sakit)", created_at=now - timedelta(days=16), due_at=now - timedelta(days=2)),
        ]
    )
    if guardians:
        g, child = guardians[1]
        db.add(DataRequest(student_id=child.id, requester_id=g.id, kind="lihat", status="diajukan", created_at=now - timedelta(days=3), due_at=now + timedelta(days=11)))

    # ── Kontak, jam, pustaka ───────────────────────────────────────────────
    db.add_all(
        [
            EmergencyContact(name="Guru BK siaga (Pak Rahman)", kind="bk", phone="0000 0000 01", hours="Senin–Jumat, jam sekolah", verified=True, note="SIMULASI: nomor fiktif, ganti dengan nomor asli"),
            EmergencyContact(name="Ruang Kesehatan Sekolah (UKS)", kind="kesehatan", phone="0000 0000 02", hours="Jam sekolah", verified=True, note="SIMULASI: nomor fiktif"),
            EmergencyContact(name="Layanan darurat nasional", kind="keamanan", phone="112", hours="24 jam", verified=True, note="Nomor publik. Verifikasi ulang oleh admin sebelum pilot."),
            EmergencyContact(name="Layanan konseling krisis", kind="krisis", phone=None, hours=None, verified=False, note="Belum dipilih. Tunggu rekomendasi psikolog."),
            EmergencyContact(name="Puskesmas terdekat", kind="kesehatan", phone=None, hours=None, verified=False, note="Perlu diisi admin"),
        ]
    )
    for wd in range(7):
        if wd <= 3:
            db.add(ServiceHours(weekday=wd, open_time="07:00", close_time="15:00"))
        elif wd == 4:
            db.add(ServiceHours(weekday=wd, open_time="07:00", close_time="11:30"))
        else:
            db.add(ServiceHours(weekday=wd, open_time=None, close_time=None))
    lib = [
        ("Napas 4-7-8 saat pikiran penuh", "latihan", "Perasaan", "Mandiri", 3, "Latihan napas singkat yang bisa dilakukan di kelas atau sebelum tidur.", "Duduk dengan nyaman. Tarik napas lewat hidung sambil menghitung sampai empat. Tahan sampai tujuh. Embuskan pelan lewat mulut sampai delapan. Ulangi empat kali.\n\nBila kepala terasa ringan, kembali bernapas biasa. Latihan ini membantu tubuh melambat, bukan menghapus masalah. Kalau perasaan berat terus datang, cerita ke orang yang kamu percaya."),
        ("Tidur yang cukup itu bagian dari belajar", "bacaan", "Tidur dan istirahat", "Mandiri", 4, "Mengapa tidur memengaruhi konsentrasi, dan tiga kebiasaan kecil untuk memulainya.", "Saat tidur, otak merapikan apa yang dipelajari seharian. Remaja umumnya butuh delapan sampai sepuluh jam.\n\nCoba tiga hal: simpan ponsel di luar jangkauan 30 menit sebelum tidur, bangun di jam yang sama termasuk akhir pekan, dan kurangi minuman berkafein setelah sore."),
        ("Memecah tugas besar jadi langkah kecil", "latihan", "Belajar", "Mandiri", 5, "Cara sederhana agar tugas yang menumpuk terasa bisa dikerjakan.", "Tulis semua tugas di satu kertas. Untuk setiap tugas, tulis satu langkah pertama yang bisa selesai dalam 15 menit. Kerjakan satu langkah saja hari ini.\n\nTugas terlambat bukan tanda kamu malas. Sering kali itu tanda bebanmu sedang banyak. Wali kelasmu bisa membantu mengatur ulang tenggat."),
        ("Kalau merasa sendirian di keramaian", "bacaan", "Teman dan keluarga", "Mandiri", 4, "Perasaan sendiri itu umum. Ini beberapa cara kecil untuk terhubung lagi.", "Merasa sendiri bisa terjadi walau kita dikelilingi banyak orang. Mulailah dari satu orang: kirim pesan singkat ke teman lama, atau duduk di dekat teman sekelas saat istirahat.\n\nKamu tidak harus langsung bercerita panjang. Hadir bersama orang lain sudah merupakan langkah."),
        ("Mengenal layanan BK di sekolah", "info", "Layanan", "Info layanan", 2, "Apa yang terjadi saat kamu datang ke BK, dan apa yang tetap rahasia.", "Guru BK mendengarkan tanpa menghakimi. Ceritamu tidak dicatat di rapor dan tidak memengaruhi nilai.\n\nKamu boleh datang sendiri atau bersama teman. Ruang BK buka Senin sampai Jumat pada jam sekolah. Kalau di luar jam itu kamu merasa tidak aman, tekan tombol Butuh bantuan sekarang."),
        ("Menenangkan hati dengan dzikir (pilihan)", "audio", "Spiritual (pilihan)", "Mandiri", 5, "Bagi yang ingin, panduan dzikir singkat untuk menenangkan diri. Sepenuhnya pilihan.", "Konten ini pilihan dan tidak terkait dengan penandaan apa pun. Disusun bersama dosen studi Islam dan psikolog sekolah.\n\nDuduk tenang, atur napas, lalu ulangi dzikir yang biasa kamu baca dengan pelan. Bila pikiran melayang, kembalikan perhatian ke napas tanpa menyalahkan diri. (Teks dan rujukan sedang ditinjau sebelum terbit penuh.)"),
        ("Saat nilai turun: bicara dengan guru", "bacaan", "Belajar", "Mandiri", 3, "Kalimat pembuka untuk menemui guru mata pelajaran tanpa canggung.", "Guru umumnya senang bila siswa datang lebih dulu. Coba: “Bu, saya kesulitan di bab ini. Boleh saya tanya bagian yang belum paham?”\n\nDatanglah di jam istirahat atau setelah kelas, bukan di depan seluruh kelas."),
        ("Mengenali tanda tubuh saat cemas", "bacaan", "Perasaan", "Mandiri", 3, "Jantung berdebar, perut tidak nyaman, sulit fokus: ini cara tubuh memberi tahu.", "Cemas adalah respons tubuh yang wajar. Tandanya bisa berupa jantung berdebar, tangan dingin, atau sulit berkonsentrasi.\n\nMenamai perasaan (“aku sedang cemas”) sudah membantu menurunkannya. Bila cemas terasa terus-menerus selama berminggu-minggu, bicarakan dengan guru BK."),
    ]
    for title, kind, cat, label, mins, summary, body in lib:
        db.add(LibraryItem(title=title, kind=kind, category=cat, source="Tim BK Sekolah Terpadu Nusantara (SIMULASI)", label=label, status="terbit", minutes=mins, summary=summary, body=body, reviewed_by="Bu Maya, S.Psi."))
    db.add(LibraryItem(title="Mengatur waktu bermain gim", kind="bacaan", category="Belajar", source="Draf tim BK", label="Mandiri", status="draf", minutes=4, summary="Draf: menyeimbangkan gim dan belajar.", body="Draf belum ditinjau."))
    db.add(LibraryItem(title="Jadwal konseling kelompok semester ini", kind="info", category="Layanan", source="Draf tim BK", label="Info layanan", status="draf", minutes=2, summary="Draf jadwal konseling kelompok.", body="Draf belum ditinjau."))

    db.add(ImportJob(filename="indikator-pekan-8-SIMULASI.csv", by_id=teguh.id, rows_total=96, rows_ok=94, rows_bad=2, kept_columns=["nis", "pekan", "kehadiran", "akses_lms", "tugas_terlambat", "nilai_kuis"], dropped_columns=["nama", "agama", "alamat"], errors=[{"line": 40, "error": "Siswa tidak terdaftar"}, {"line": 77, "error": "Kehadiran harus 0 sampai 5"}], at=now - timedelta(days=3, hours=3)))
    db.commit()

    # ── Log audit awal (berantai) ──────────────────────────────────────────
    audit.write(db, teguh, "impor_data", "impor", None, "94 baris masuk, 2 ditolak, 3 kolom dibuang", at=now - timedelta(days=3, hours=3))
    for c in db.scalars(select(Case).where(Case.first_contact_at.is_not(None)).order_by(Case.first_contact_at)).all()[:8]:
        actor = db.get(User, c.owner_id) if c.owner_id else sari
        audit.write(db, actor, "buka_kasus", "kasus", c.id, at=c.first_contact_at - timedelta(minutes=20))
        audit.write(db, actor, "catat_tindakan", "kasus", c.id, "disapa" if actor.role == "guru" else "mulai_sesi", at=c.first_contact_at)
    audit.write(db, hasan, "setujui_aturan", "aturan", "K1 v2", at=t0 + timedelta(days=22))
    audit.write(db, teguh, "ajukan_aturan", "aturan", "K2 v2", at=now - timedelta(days=2))
    audit.write(db, ratna, "usul_relasi", "relasi", None, "bk: Bu Maya → siswa 8B", at=now - timedelta(days=1))
    run_xai_tests(db)


def reset_and_seed() -> None:
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        seed(db)


def ensure_seeded() -> None:
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        if db.scalar(select(Institution.id)) is None:
            seed(db)


if __name__ == "__main__":
    if "--reset" in sys.argv:
        reset_and_seed()
        print("Basis data dibuat ulang dengan data SIMULASI.")
    else:
        ensure_seeded()
        print("Basis data siap.")
