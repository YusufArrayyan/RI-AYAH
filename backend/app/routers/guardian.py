"""Layar wali W1–W3. Wali tidak pernah menerima zona, alasan, atau jawaban check-in."""
from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import audit
from ..access import consent_state, related_student_ids, require_guardian_of, subject_for
from ..db import get_db
from ..models import CheckinResponse, Consent, DataRequest, Invitation, User, WeeklyIndicator
from ..security import require_role
from ..services import withdraw_all
from ..timeutil import utcnow
from .student import DATA_LABELS, NOT_READ, export_payload

router = APIRouter(prefix="/api/guardian", tags=["wali"])
guardian_only = require_role("wali")

GUARDIAN_TYPES = ("kehadiran", "lms", "tugas", "kuis", "checkin")


def _consent_summary(db: Session, student: User) -> dict:
    st = consent_state(db, student.id)
    items = []
    for dt in GUARDIAN_TYPES:
        label, desc = DATA_LABELS[dt]
        s = st[dt]
        items.append(
            {
                "type": dt,
                "label": label,
                "description": desc,
                "granted": bool(s["persetujuan"]),
                "child_assent": s["asen"],
                "since": s["since"].isoformat() if s["since"] else None,
            }
        )
    any_g = any(i["granted"] for i in items)
    assent_any = any(i["child_assent"] for i in items)
    if not any_g:
        status = "belum"
    elif not assent_any:
        status = "menunggu_asen"
    else:
        status = "aktif"
    return {"items": items, "status": status}


@router.get("/children")
def children(user: User = Depends(guardian_only), db: Session = Depends(get_db)):
    out = []
    for sid in sorted(related_student_ids(db, user, ("wali",))):
        s = db.get(User, sid)
        if s is None:
            continue
        cs = _consent_summary(db, s)
        pending = db.scalar(
            select(func.count()).select_from(Invitation).where(Invitation.student_id == sid, Invitation.guardian_id == user.id, Invitation.status == "menunggu")
        )
        out.append(
            {"id": s.id, "name": s.name, "nickname": s.nickname, "class_name": s.class_name, "level": s.level, "consent_status": cs["status"], "pending_invitations": pending}
        )
    return out


@router.get("/children/{sid}/consent")
def get_consent(sid: int, user: User = Depends(guardian_only), db: Session = Depends(get_db)):
    student = require_guardian_of(db, user, sid)
    cs = _consent_summary(db, student)
    return {
        "child": {"id": student.id, "name": student.name, "class_name": student.class_name, "mode": student.ui_mode},
        **cs,
        "purpose": "Satu tujuan saja: agar wali kelas dan guru BK bisa menyapa anak lebih awal bila beberapa hal berubah.",
        "not_read": NOT_READ,
        "rights": [
            "Melihat dan mengunduh data anak yang tersimpan",
            "Memperbaiki data yang keliru",
            "Menarik persetujuan kapan saja, tanpa alasan",
            "Meminta data anak dihapus",
        ],
        "not_shown": "Anda tidak melihat zona, alasan, atau jawaban check-in anak. Bila perlu, guru BK yang akan menjelaskan langsung.",
    }


class GuardianConsentIn(BaseModel):
    choices: dict[str, bool]
    legal_guardian: bool


@router.post("/children/{sid}/consent")
def set_consent(sid: int, body: GuardianConsentIn, user: User = Depends(guardian_only), db: Session = Depends(get_db)):
    student = require_guardian_of(db, user, sid)
    if any(body.choices.values()) and not body.legal_guardian:
        raise HTTPException(422, "Centang pernyataan bahwa Anda wali sah sebelum memberi persetujuan")
    st = consent_state(db, student.id)
    now = utcnow()
    for dt, granted in body.choices.items():
        if dt not in GUARDIAN_TYPES:
            raise HTTPException(422, f"Jenis data tidak dikenal: {dt}")
        if st[dt]["persetujuan"] == granted:
            continue
        db.add(Consent(student_id=student.id, data_type=dt, kind="persetujuan", granted=granted, actor_id=user.id, at=now))
    audit.write(db, user, "persetujuan_wali", "siswa", student.id, commit=False)
    db.commit()
    return {"ok": True, **_consent_summary(db, student)}


def _invitation_json(db: Session, inv: Invitation) -> dict:
    counselor = db.get(User, inv.counselor_id)
    return {
        "id": inv.id,
        "message": inv.message,
        "slots": inv.slots,
        "chosen": inv.chosen,
        "status": inv.status,
        "created_at": inv.created_at.isoformat(),
        "counselor": counselor.title if counselor else None,
        "expired": all(s.get("past") for s in inv.slots) if inv.slots else False,
    }


@router.get("/children/{sid}/summary")
def summary(sid: int, user: User = Depends(guardian_only), db: Session = Depends(get_db)):
    student = require_guardian_of(db, user, sid)
    invs = db.scalars(
        select(Invitation).where(Invitation.student_id == sid, Invitation.guardian_id == user.id).order_by(Invitation.id.desc())
    ).all()
    return {
        "child": {"id": student.id, "name": student.name, "class_name": student.class_name},
        "consent": _consent_summary(db, student),
        "invitations": [_invitation_json(db, i) for i in invs],
        "why_no_zone": "Zona dan alasan tidak ditampilkan kepada wali agar anak tidak merasa dihukum di rumah. Guru BK menjelaskan langsung dalam pertemuan.",
        "bk_contact": {"name": "Ruang BK", "hours": "Senin–Jumat, 07.00–15.00"},
    }


class ConfirmIn(BaseModel):
    slot: str


@router.post("/invitations/{iid}/confirm")
def confirm(iid: int, body: ConfirmIn, user: User = Depends(guardian_only), db: Session = Depends(get_db)):
    inv = db.get(Invitation, iid)
    if inv is None or inv.guardian_id != user.id:
        raise HTTPException(404, "Undangan tidak ditemukan")
    if body.slot not in [s["id"] for s in inv.slots]:
        raise HTTPException(422, "Pilih salah satu waktu yang ditawarkan")
    inv.chosen = body.slot
    inv.status = "dikonfirmasi"
    audit.write(db, user, "konfirmasi_undangan", "undangan", inv.id, commit=False)
    db.commit()
    return _invitation_json(db, inv)


@router.post("/invitations/{iid}/reschedule")
def reschedule(iid: int, user: User = Depends(guardian_only), db: Session = Depends(get_db)):
    inv = db.get(Invitation, iid)
    if inv is None or inv.guardian_id != user.id:
        raise HTTPException(404, "Undangan tidak ditemukan")
    inv.status = "minta_ulang"
    db.commit()
    return _invitation_json(db, inv)


@router.get("/children/{sid}/rights")
def rights(sid: int, user: User = Depends(guardian_only), db: Session = Depends(get_db)):
    student = require_guardian_of(db, user, sid)
    s = subject_for(db, student)
    weeks = db.scalar(select(func.count()).select_from(WeeklyIndicator).where(WeeklyIndicator.subject_id == s.id)) if s else 0
    checkins = db.scalar(select(func.count()).select_from(CheckinResponse).where(CheckinResponse.subject_id == s.id)) if s else 0
    reqs = db.scalars(select(DataRequest).where(DataRequest.student_id == sid).order_by(DataRequest.id.desc())).all()
    now = utcnow()
    return {
        "child": {"id": student.id, "name": student.name, "class_name": student.class_name},
        "consent": _consent_summary(db, student),
        "stored": [
            f"Catatan kehadiran, aktivitas belajar daring, tugas terlambat, dan nilai kuis untuk {weeks} pekan",
            f"{checkins} check-in mingguan (isinya hanya terbaca guru BK)",
            "Riwayat persetujuan Anda dan asen anak",
            "Catatan siapa yang membuka data anak dan kapan",
        ],
        "retention": "Data anak disimpan lebih singkat daripada data mahasiswa. Durasi pasti ditetapkan DPO sekolah.",
        "requests": [
            {
                "id": r.id,
                "kind": r.kind,
                "status": r.status,
                "created_at": r.created_at.isoformat(),
                "due_at": r.due_at.isoformat(),
                "overdue": r.status not in ("selesai", "ditolak") and r.due_at < now,
            }
            for r in reqs
        ],
    }


class GRequestIn(BaseModel):
    kind: str
    detail: str = ""


@router.post("/children/{sid}/requests")
def create_request(sid: int, body: GRequestIn, user: User = Depends(guardian_only), db: Session = Depends(get_db)):
    require_guardian_of(db, user, sid)
    if body.kind not in ("lihat", "perbaiki", "hapus"):
        raise HTTPException(422, "Jenis permintaan tidak dikenal")
    now = utcnow()
    r = DataRequest(student_id=sid, requester_id=user.id, kind=body.kind, status="diproses" if body.kind == "hapus" else "diajukan", detail=body.detail[:1000] or None, created_at=now, due_at=now + timedelta(days=14))
    db.add(r)
    audit.write(db, user, f"minta_{body.kind}", "siswa", sid, "Diajukan wali", commit=False)
    db.commit()
    return {"ok": True, "id": r.id}


@router.get("/children/{sid}/export")
def export(sid: int, user: User = Depends(guardian_only), db: Session = Depends(get_db)):
    student = require_guardian_of(db, user, sid)
    payload = export_payload(db, student)
    # Wali tidak menerima zona, alasan, atau isi check-in (matriks 3.2).
    payload.pop("penandaan", None)
    payload.pop("kasus", None)
    payload["checkin"] = [{"pekan": c["pekan"], "isi": "Hanya terbaca guru BK"} for c in payload["checkin"]]
    audit.write(db, user, "unduh_data", "siswa", sid, "Diunduh wali")
    return JSONResponse(payload, headers={"Content-Disposition": 'attachment; filename="data-riayah-anak.json"'})


@router.post("/children/{sid}/withdraw")
def withdraw(sid: int, user: User = Depends(guardian_only), db: Session = Depends(get_db)):
    student = require_guardian_of(db, user, sid)
    s = subject_for(db, student)
    return withdraw_all(db, student, user, s.id if s else None)
