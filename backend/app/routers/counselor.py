"""Layar guru BK atau konselor K1–K4."""
from __future__ import annotations

import json
from collections import Counter, defaultdict
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import audit, content
from ..access import consent_state, processing_allowed, require_counselor_case, user_for_subject
from ..analytics import median_or_none
from ..db import get_db
from ..models import (
    Case,
    CheckinResponse,
    CounselingNote,
    EmergencyContact,
    Flag,
    FollowUp,
    Invitation,
    Relation,
    Setting,
    Subject,
    User,
    WeeklyIndicator,
)
from ..security import decrypt, encrypt, require_role
from ..services import (
    OPEN_STATUSES,
    active_params,
    follow_ups,
    get_setting,
    reasons_json,
    refresh_sla,
    sla_info,
)
from ..timeutil import utcnow
from .common import contact_json

router = APIRouter(prefix="/api/counselor", tags=["bk"])
bk_only = require_role("bk")

RULE_LABELS = {
    "M1": "M1 · Bantuan/keselamatan",
    "K1": "K1 · Tren memburuk",
    "K2": "K2 · Check-in",
}


def _owner_label(db: Session, owner_id: int | None) -> str:
    if owner_id is None:
        return "Belum ditugaskan"
    u = db.get(User, owner_id)
    return u.title or u.name if u else "-"


@router.get("/cases")
def queue(tab: str = "merah", user: User = Depends(bk_only), db: Session = Depends(get_db)):
    refresh_sla(db)
    all_cases = db.scalars(select(Case).order_by(Case.due_at)).all()
    counselor_ids = {u.id for u in db.scalars(select(User).where(User.role == "bk"))}

    def visible(c: Case) -> bool:
        if user.is_coordinator:
            return True
        if c.owner_id == user.id or c.owner_id is None:
            return True
        # Kuning milik guru tidak tampil kecuali diteruskan ke BK.
        return False

    def in_bk(c: Case) -> bool:
        return c.zone == "merah" or c.owner_id in counselor_ids or c.owner_id is None or c.status == "terlambat"

    pool = [c for c in all_cases if visible(c) and in_bk(c)]
    open_ = [c for c in pool if c.status in OPEN_STATUSES]
    if tab == "selesai":
        rows = [c for c in pool if c.status == "ditutup"][-30:]
    else:
        rows = [c for c in open_ if c.zone == tab]
    now = utcnow()
    subjects = {s.id: s for s in db.scalars(select(Subject))}
    red_hours = [
        (c.first_contact_at - c.created_at).total_seconds() / 3600
        for c in all_cases
        if c.zone == "merah" and c.first_contact_at
    ]
    return {
        "stats": {
            "red_open": sum(1 for c in open_ if c.zone == "merah"),
            "yellow_open": sum(1 for c in open_ if c.zone == "kuning"),
            "overdue": sum(1 for c in open_ if sla_info(c)["overdue"]),
            "red_median_hours": median_or_none(red_hours),
        },
        "rows": [
            {
                "id": c.id,
                "code": subjects[c.subject_id].code,
                "class_name": subjects[c.subject_id].class_name,
                "zone": c.zone,
                "rule": RULE_LABELS.get(c.rule_id, c.rule_id),
                "rule_id": c.rule_id,
                "owner": _owner_label(db, c.owner_id),
                "mine": c.owner_id == user.id,
                "unassigned": c.owner_id is None,
                "status": c.status,
                "created_at": c.created_at.isoformat(),
                "escalated": c.status == "terlambat",
                **sla_info(c),
            }
            for c in rows
        ],
        "counselors": [
            {"id": u.id, "title": u.title, "active": sum(1 for c in all_cases if c.owner_id == u.id and c.status in OPEN_STATUSES)}
            for u in db.scalars(select(User).where(User.role == "bk", User.active.is_(True)))
        ],
        "is_coordinator": user.is_coordinator,
        "now": now.isoformat(),
    }


@router.post("/cases/{case_id}/take")
def take(case_id: int, user: User = Depends(bk_only), db: Session = Depends(get_db)):
    c = db.get(Case, case_id)
    if c is None:
        raise HTTPException(404, "Kasus tidak ditemukan")
    if c.owner_id not in (None, user.id) and not user.is_coordinator:
        raise HTTPException(403, "Kasus ini sudah ditangani konselor lain")
    c.owner_id = user.id
    db.add(FollowUp(case_id=c.id, actor_id=user.id, action="ambil_kasus", outcome=f"Ditangani {user.title}"))
    audit.write(db, user, "ambil_kasus", "kasus", c.id, commit=False)
    db.commit()
    return {"ok": True}


class ReassignIn(BaseModel):
    to: int


@router.post("/cases/{case_id}/reassign")
def reassign(case_id: int, body: ReassignIn, user: User = Depends(bk_only), db: Session = Depends(get_db)):
    c = db.get(Case, case_id)
    if c is None:
        raise HTTPException(404, "Kasus tidak ditemukan")
    require_counselor_case(db, user, c)
    target = db.get(User, body.to)
    if target is None or target.role != "bk":
        raise HTTPException(422, "Tujuan harus guru BK")
    c.owner_id = target.id
    db.add(FollowUp(case_id=c.id, actor_id=user.id, action="alihkan", outcome=f"Dialihkan ke {target.title}"))
    audit.write(db, user, "alihkan_kasus", "kasus", c.id, f"ke {target.title}", commit=False)
    db.commit()
    return {"ok": True}


@router.get("/cases/{case_id}")
def detail(case_id: int, user: User = Depends(bk_only), db: Session = Depends(get_db)):
    c = db.get(Case, case_id)
    if c is None:
        raise HTTPException(404, "Kasus tidak ditemukan")
    require_counselor_case(db, user, c)
    s = db.get(Subject, c.subject_id)
    student = user_for_subject(db, c.subject_id)
    can_read_checkin = bool(student and processing_allowed(db, student, "bk_baca_checkin"))
    # Aturan wajib 14.3.4: log ditulis sebelum data dikirim.
    audit.write(db, user, "buka_kasus", "kasus", c.id, commit=False)
    if can_read_checkin:
        audit.write(db, user, "baca_checkin", "kasus", c.id, commit=False)
    notes = db.scalars(select(CounselingNote).where(CounselingNote.case_id == c.id).order_by(CounselingNote.at)).all()
    db.commit()

    f = db.get(Flag, c.flag_id) if c.flag_id else None
    weeks = db.scalars(select(WeeklyIndicator).where(WeeklyIndicator.subject_id == s.id).order_by(WeeklyIndicator.week)).all()
    last_checkin = db.scalars(
        select(CheckinResponse).where(CheckinResponse.subject_id == s.id).order_by(CheckinResponse.week.desc())
    ).first()
    checkin = None
    if last_checkin:
        if can_read_checkin:
            data = json.loads(decrypt(last_checkin.answers_enc))
            items = {i["id"]: i["text"] for i in content.CHECKIN_ITEMS}
            labels = {ch["value"]: ch["label"] for ch in content.CHECKIN_CHOICES}
            checkin = {
                "week": last_checkin.week,
                "readable": True,
                "score": int(decrypt(last_checkin.score_enc)),
                "max": active_params(db)["K2"].get("max", 12),
                "threshold": active_params(db)["K2"]["threshold"],
                "safety": last_checkin.safety,
                "answers": [
                    {"item": items.get(k, k), "answer": labels.get(v, "Dilewati") if v is not None else "Dilewati"}
                    for k, v in data["answers"].items()
                ],
            }
        else:
            checkin = {"week": last_checkin.week, "readable": False}
    st = consent_state(db, student.id) if student else {}
    guardian = None
    if student:
        rel = db.scalars(select(Relation).where(Relation.student_id == student.id, Relation.kind == "wali", Relation.status == "aktif")).first()
        if rel:
            g = db.get(User, rel.actor_id)
            guardian = {"id": g.id, "name": g.name}
    withdrawn = c.status == "ditutup" and c.closed_reason == "Persetujuan ditarik"
    return {
        "id": c.id,
        "code": s.code,
        "student_name": student.name if student else None,
        "student_id": student.id if student else None,
        "class_name": s.class_name,
        "zone": c.zone,
        "rule": RULE_LABELS.get(c.rule_id, c.rule_id),
        "rule_id": c.rule_id,
        "status": c.status,
        "owner": _owner_label(db, c.owner_id),
        "student_response": c.student_response,
        "withdrawn": withdrawn,
        "closed_reason": c.closed_reason,
        "reasons": reasons_json(f, for_role="bk"),
        "counterfactual": (f.counterfactual or {}).get("text") if f else None,
        "params": active_params(db),
        "flag_week": f.week if f else None,
        "flagged_at": c.created_at.isoformat(),
        "indicators": [
            {"week": w.week, "kehadiran": w.kehadiran, "lms": w.lms, "tugas": w.tugas, "kuis": w.kuis} for w in weeks[-6:]
        ],
        "checkin": checkin,
        "consent": {
            dt: {"granted": bool(v.get("persetujuan")), "assent": v.get("asen")} for dt, v in st.items()
        },
        "guardian": guardian,
        "notes": [
            {"id": n.id, "content": decrypt(n.content_enc), "label": n.label, "at": n.at.isoformat(), "mine": n.author_id == user.id}
            for n in notes
            if n.author_id == user.id or user.is_coordinator
        ],
        "history": follow_ups(db, c.id),
        "outcomes": content.OUTCOME_CODES["bk"],
        **sla_info(c),
    }


class NoteIn(BaseModel):
    content: str
    label: str | None = None


@router.post("/cases/{case_id}/notes")
def add_note(case_id: int, body: NoteIn, user: User = Depends(bk_only), db: Session = Depends(get_db)):
    c = db.get(Case, case_id)
    if c is None:
        raise HTTPException(404, "Kasus tidak ditemukan")
    require_counselor_case(db, user, c)
    if c.status == "ditutup" and c.closed_reason == "Persetujuan ditarik":
        raise HTTPException(409, "Persetujuan ditarik. Catatan baru tidak dapat ditambahkan; ikuti prosedur retensi.")
    if not body.content.strip():
        raise HTTPException(422, "Catatan masih kosong")
    if body.label and body.label not in content.OUTCOME_CODES["bk"]:
        raise HTTPException(422, "Label hasil tidak dikenal")
    db.add(CounselingNote(case_id=c.id, author_id=user.id, content_enc=encrypt(body.content.strip()[:5000]), label=body.label))
    if c.first_contact_at is None:
        c.first_contact_at = utcnow()
    if c.status in ("baru", "terlambat"):
        c.status = "ditindaklanjuti"
    audit.write(db, user, "tulis_catatan", "kasus", c.id, body.label, commit=False)
    db.commit()
    return {"ok": True}


class BkActionIn(BaseModel):
    action: str  # mulai_sesi | hubungi_wali | rujuk | tutup
    reason: str | None = None
    review_at: date | None = None
    slots: list[str] | None = None
    referral_to: str | None = None


@router.post("/cases/{case_id}/action")
def action(case_id: int, body: BkActionIn, user: User = Depends(bk_only), db: Session = Depends(get_db)):
    c = db.get(Case, case_id)
    if c is None:
        raise HTTPException(404, "Kasus tidak ditemukan")
    require_counselor_case(db, user, c)
    if c.status == "ditutup":
        raise HTTPException(409, "Kasus sudah ditutup")
    now = utcnow()
    if body.action == "mulai_sesi":
        c.status = "ditindaklanjuti"
        c.first_contact_at = c.first_contact_at or now
        db.add(FollowUp(case_id=c.id, actor_id=user.id, action="mulai_sesi", outcome="Sesi dimulai"))
    elif body.action == "hubungi_wali":
        student = user_for_subject(db, c.subject_id)
        rel = db.scalars(select(Relation).where(Relation.student_id == student.id, Relation.kind == "wali", Relation.status == "aktif")).first() if student else None
        if rel is None:
            raise HTTPException(409, "Siswa ini tidak memiliki wali terdaftar")
        slots = body.slots or []
        if not slots:
            raise HTTPException(422, "Tawarkan setidaknya satu pilihan waktu")
        db.add(
            Invitation(
                student_id=student.id,
                guardian_id=rel.actor_id,
                counselor_id=user.id,
                message=f"{user.title} mengundang Anda berbincang tentang pendampingan {student.nickname} di sekolah.",
                slots=[{"id": f"s{i}", "label": s} for i, s in enumerate(slots[:3])],
            )
        )
        db.add(FollowUp(case_id=c.id, actor_id=user.id, action="hubungi_wali", outcome="Undangan dikirim ke wali"))
    elif body.action == "rujuk":
        if not body.referral_to:
            raise HTTPException(422, "Pilih tujuan rujukan")
        c.status = "ditindaklanjuti"
        db.add(FollowUp(case_id=c.id, actor_id=user.id, action="rujuk", outcome=f"Dirujuk ke {body.referral_to}"))
    elif body.action == "tutup":
        if not body.reason or not body.review_at:
            raise HTTPException(422, "Tutup kasus memerlukan alasan dan jadwal tinjauan")
        c.status = "ditutup"
        c.closed_at = now
        c.closed_reason = body.reason
        c.review_at = body.review_at
        if c.flag_id:
            f = db.get(Flag, c.flag_id)
            f.active = False
            f.released_at = now
        db.add(FollowUp(case_id=c.id, actor_id=user.id, action="tutup", outcome=body.reason))
    else:
        raise HTTPException(422, "Aksi tidak dikenal")
    audit.write(db, user, "catat_tindakan", "kasus", c.id, body.action, commit=False)
    db.commit()
    return {"ok": True}


@router.get("/protocol")
def protocol(user: User = Depends(bk_only), db: Session = Depends(get_db)):
    rows = db.scalars(select(EmergencyContact).order_by(EmergencyContact.id)).all()
    contacts = [contact_json(c, admin_view=True) for c in rows]
    return {
        "draft": True,
        "steps": content.CRISIS_PROTOCOL,
        "contacts": contacts,
        "missing": sum(1 for c in contacts if c["status"] == "belum_diisi"),
        "referral_targets": [c["name"] for c in contacts if c["kind"] in ("kesehatan", "krisis") and c["status"] == "aktif"],
    }


@router.get("/load")
def load(user: User = Depends(bk_only), db: Session = Depends(get_db)):
    cases = db.scalars(select(Case)).all()
    counselors = db.scalars(select(User).where(User.role == "bk", User.active.is_(True))).all()
    cap = get_setting(db, "capacity", {"per_counselor_week": 6, "per_counselor_active": 12})
    per_active = cap.get("per_counselor_active", 12)
    now = utcnow()
    per = []
    for u in counselors:
        active = sum(1 for c in cases if c.owner_id == u.id and c.status in OPEN_STATUSES)
        per.append({"id": u.id, "title": u.title, "active": active, "capacity": per_active, "ratio": round(active / per_active, 2)})
    total_active = sum(p["active"] for p in per)
    total_cap = per_active * max(1, len(counselors))
    resp = [
        (c.first_contact_at - c.created_at).total_seconds() / 3600 for c in cases if c.first_contact_at and c.zone == "merah"
    ]
    # Tren kasus baru per pekan (8 pekan terakhir), dihitung dari tanggal dibuat.
    buckets: dict[int, Counter] = defaultdict(Counter)
    for c in cases:
        wk = (now - c.created_at).days // 7
        if wk < 8:
            buckets[7 - wk][c.zone] += 1
    trend = [{"week_offset": i - 7, "kuning": buckets[i]["kuning"], "merah": buckets[i]["merah"]} for i in range(8)]
    util_hist = get_setting(db, "utilization_history", {"weeks": []})["weeks"]
    current_util = round(total_active / total_cap, 2) if total_cap else 0
    two_weeks_high = len(util_hist) >= 1 and util_hist[-1] > 0.85 and current_util > 0.85
    return {
        "active": total_active,
        "capacity": total_cap,
        "utilization": current_util,
        "red_median_hours": median_or_none(resp),
        "per_counselor": per,
        "trend": trend,
        "over_threshold": two_weeks_high,
        "suggestion": (
            "Beban di atas 85% selama dua pekan. Pertimbangkan menaikkan ambang K2 atau menambah konselor siaga. Kirim saran ke admin untuk dihitung di estimator."
            if two_weeks_high
            else None
        ),
    }


class SuggestIn(BaseModel):
    message: str


@router.post("/load/suggest")
def suggest(body: SuggestIn, user: User = Depends(bk_only), db: Session = Depends(get_db)):
    s = db.get(Setting, "bk_suggestions")
    items = list(s.value["items"]) if s else []
    items.append({"from": user.title, "message": body.message[:500], "at": utcnow().isoformat()})
    if s:
        s.value = {"items": items}
    else:
        db.add(Setting(key="bk_suggestions", value={"items": items}))
    audit.write(db, user, "saran_ambang", "aturan", None, commit=False)
    db.commit()
    return {"ok": True}


@router.get("/students/{student_id}/guardian-slots")
def default_slots(student_id: int, user: User = Depends(bk_only)):
    base = utcnow().date() + timedelta(days=2)
    days = []
    d = base
    while len(days) < 3:
        if d.weekday() < 5:
            days.append(d)
        d += timedelta(days=1)
    names = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat"]
    return [f"{names[x.weekday()]}, {x.day} {['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'][x.month-1]} · {t}" for x, t in zip(days, ["09.00", "13.00", "10.30"])]
