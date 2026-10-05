"""Layar guru atau dosen PA G1–G3. Hanya kuning, hanya siswa binaan, tanpa skor atau isi check-in."""
from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import audit, content, rules
from ..access import processing_allowed, related_subject_ids, require_teacher_case, user_for_subject
from ..db import get_db
from ..models import Case, Flag, FollowUp, Subject, User
from ..security import require_role
from ..services import (
    OPEN_STATUSES,
    create_flag_and_case,
    follow_ups,
    least_loaded_counselor,
    reasons_json,
    refresh_sla,
    sla_info,
)
from ..timeutil import utcnow

router = APIRouter(prefix="/api/teacher", tags=["guru"])
teacher_only = require_role("guru")

HIDDEN_FROM_TEACHER = [
    "Skor atau probabilitas apa pun",
    "Isi jawaban check-in",
    "Catatan konseling guru BK",
    "Kasus merah dan permintaan bantuan",
]


@router.get("/cases")
def cases(class_name: str = "", user: User = Depends(teacher_only), db: Session = Depends(get_db)):
    refresh_sla(db)
    sids = related_subject_ids(db, user, ("wali_kelas", "dosen_pa"))
    if not sids:
        return {"stats": {"waiting": 0, "overdue": 0, "greeted_week": 0}, "classes": [], "rows": []}
    rows = db.scalars(
        select(Case).where(Case.subject_id.in_(sids), Case.zone == "kuning").order_by(Case.due_at)
    ).all()
    subjects = {s.id: s for s in db.scalars(select(Subject).where(Subject.id.in_(sids)))}
    classes = sorted({s.class_name for s in subjects.values()})
    now = utcnow()
    open_rows = sorted(
        (c for c in rows if c.status in OPEN_STATUSES),
        key=lambda c: (c.status not in ("terlambat", "baru"), c.status != "terlambat", c.due_at),
    )
    out = []
    for c in open_rows:
        s = subjects[c.subject_id]
        if class_name and s.class_name != class_name:
            continue
        f = db.get(Flag, c.flag_id) if c.flag_id else None
        rs = reasons_json(f, for_role="guru")[:2]
        out.append(
            {
                "id": c.id,
                "code": s.code,
                "class_name": s.class_name,
                "status": c.status,
                "student_response": c.student_response,
                "reasons": [r["text"] for r in rs],
                "rule_id": c.rule_id,
                **sla_info(c),
            }
        )
    greeted = [
        c for c in rows if c.first_contact_at and (now - c.first_contact_at) <= timedelta(days=7)
    ]
    return {
        "stats": {
            "waiting": sum(1 for c in open_rows if c.status in ("baru", "terlambat")),
            "overdue": sum(1 for c in open_rows if sla_info(c)["overdue"]),
            "greeted_week": len(greeted),
        },
        "classes": classes,
        "rows": out,
        "note": "Nama siswa tampil setelah Anda membuka kasus. Setiap pembukaan tercatat.",
    }


@router.get("/cases/{case_id}")
def case_detail(case_id: int, user: User = Depends(teacher_only), db: Session = Depends(get_db)):
    c = db.get(Case, case_id)
    if c is None:
        raise HTTPException(404, "Kasus tidak ditemukan")
    require_teacher_case(db, user, c)
    # Aturan wajib 14.3.4: tulis log sebelum data dikirim.
    audit.write(db, user, "buka_kasus", "kasus", c.id)
    s = db.get(Subject, c.subject_id)
    student = user_for_subject(db, c.subject_id)
    withdrawn = c.status == "ditutup" and c.closed_reason == "Persetujuan ditarik"
    f = db.get(Flag, c.flag_id) if c.flag_id else None
    return {
        "id": c.id,
        "code": s.code,
        "class_name": s.class_name,
        "student_name": student.name if student else None,
        "zone": c.zone,
        "rule_id": c.rule_id,
        "status": c.status,
        "student_response": c.student_response,
        "withdrawn": withdrawn,
        "reasons": [] if withdrawn else reasons_json(f, for_role="guru"),
        "counterfactual": None if withdrawn or not f else (f.counterfactual or {}).get("text"),
        "hidden": HIDDEN_FROM_TEACHER,
        "flag_week": f.week if f else None,
        "flagged_at": c.created_at.isoformat(),
        "history": follow_ups(db, c.id),
        "outcomes": content.OUTCOME_CODES["guru"],
        "checkin_active": bool(student and processing_allowed(db, student, "checkin")),
        **sla_info(c),
    }


class ActionIn(BaseModel):
    action: str  # disapa | jadwal_ulang | teruskan_bk | tanda_bahaya
    outcome: str | None = None
    days: int | None = None


@router.post("/cases/{case_id}/action")
def action(case_id: int, body: ActionIn, user: User = Depends(teacher_only), db: Session = Depends(get_db)):
    c = db.get(Case, case_id)
    if c is None:
        raise HTTPException(404, "Kasus tidak ditemukan")
    require_teacher_case(db, user, c)
    if c.status not in OPEN_STATUSES:
        raise HTTPException(409, "Kasus sudah ditutup")
    now = utcnow()
    if body.action == "disapa":
        if body.outcome not in content.OUTCOME_CODES["guru"]:
            raise HTTPException(422, "Pilih kode hasil sapaan")
        c.status = "disapa"
        c.first_contact_at = c.first_contact_at or now
        db.add(FollowUp(case_id=c.id, actor_id=user.id, action="disapa", outcome=body.outcome))
    elif body.action == "jadwal_ulang":
        days = max(1, min(body.days or 7, 21))
        c.due_at = now + timedelta(days=days)
        if c.status == "terlambat":
            c.status = "baru"
        db.add(FollowUp(case_id=c.id, actor_id=user.id, action="jadwal_ulang", outcome=f"Dijadwalkan ulang {days} hari"))
    elif body.action == "teruskan_bk":
        counselor = least_loaded_counselor(db)
        c.status = "ditindaklanjuti"
        c.owner_id = counselor.id if counselor else None
        db.add(FollowUp(case_id=c.id, actor_id=user.id, action="teruskan_bk", outcome=f"Diteruskan ke {counselor.title if counselor else 'BK'}"))
    elif body.action == "tanda_bahaya":
        s = db.get(Subject, c.subject_id)
        reason = rules.ReasonOut(
            "bantuan", "Tanda bahaya", "Wali kelas melihat tanda bahaya saat menyapa.", "Dilaporkan dari sapaan guru", [], None, 1.0
        )
        ev = rules.Evaluation("merah", "M1", [reason])
        create_flag_and_case(db, s, ev, week=db.get(Flag, c.flag_id).week if c.flag_id else 0)
        c.status = "ditindaklanjuti"
        db.add(FollowUp(case_id=c.id, actor_id=user.id, action="tanda_bahaya", outcome="Antrean merah BK dibuka"))
    else:
        raise HTTPException(422, "Aksi tidak dikenal")
    audit.write(db, user, "catat_tindakan", "kasus", c.id, body.action, commit=False)
    db.commit()
    return case_detail(case_id, user, db)


@router.get("/guide")
def guide(user: User = Depends(teacher_only)):
    return content.TEACHER_GUIDE
