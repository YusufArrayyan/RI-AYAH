"""Layar komite etik dan DPO E1–E4."""
from __future__ import annotations

import csv
import io

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from .. import audit
from ..access import user_for_subject
from ..analytics import fairness, run_xai_tests
from ..db import get_db
from ..models import AuditLog, Case, DataRequest, Flag, FollowUp, Objection, RuleVersion, Subject, User, XaiTest
from ..security import current_user, require_role
from ..services import reasons_json
from ..timeutil import utcnow
from .admin import rule_json

router = APIRouter(prefix="/api/ethics", tags=["komite"])
committee = require_role("komite")


@router.get("/audit")
def audit_log(actor: str = "", action: str = "", q: str = "", limit: int = 100, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Komite melihat semua; admin hanya log teknis (matriks 3.2)."""
    if user.role not in ("komite", "admin"):
        raise HTTPException(403, "Peran Anda tidak memiliki akses ke log audit")
    stmt = select(AuditLog)
    if user.role == "admin":
        stmt = stmt.where(AuditLog.technical.is_(True))
    if actor:
        stmt = stmt.where(AuditLog.actor_role == actor)
    if action:
        stmt = stmt.where(AuditLog.action == action)
    if q.strip():
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(AuditLog.actor_label.ilike(like), AuditLog.detail.ilike(like), AuditLog.object_id.ilike(like)))
    rows = db.scalars(stmt.order_by(AuditLog.id.desc()).limit(max(10, min(limit, 500)))).all()
    actions = sorted({a for a in db.scalars(select(AuditLog.action).distinct())})
    return {
        "rows": [
            {
                "id": r.id,
                "at": r.at.isoformat(),
                "actor": r.actor_label,
                "role": r.actor_role,
                "action": r.action,
                "object": f"{r.object_type}{(' ' + r.object_id) if r.object_id else ''}",
                "detail": r.detail,
                "hash": r.hash,
                "prev_hash": r.prev_hash,
            }
            for r in rows
        ],
        "actions": actions,
    }


@router.get("/audit/verify")
def verify(user: User = Depends(committee), db: Session = Depends(get_db)):
    result = audit.verify_chain(db)
    audit.write(db, user, "verifikasi_rantai", "log_audit", None, "utuh" if result["ok"] else f"rusak di {result['broken_ids'][:3]}")
    return result


@router.get("/audit/export", response_class=PlainTextResponse)
def export(user: User = Depends(committee), db: Session = Depends(get_db)):
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["id", "waktu", "aktor", "peran", "aksi", "objek", "keterangan", "hash_sebelumnya", "hash"])
    for r in db.scalars(select(AuditLog).order_by(AuditLog.id)):
        w.writerow([r.id, r.at.isoformat(), r.actor_label, r.actor_role, r.action, f"{r.object_type} {r.object_id or ''}".strip(), r.detail or "", r.prev_hash, r.hash])
    audit.write(db, user, "ekspor_log", "log_audit", None)
    return PlainTextResponse(buf.getvalue(), headers={"Content-Disposition": 'attachment; filename="log-audit-riayah.csv"'})


@router.get("/fairness")
def get_fairness(user: User = Depends(committee), db: Session = Depends(get_db)):
    data = fairness(db)
    cases = db.scalars(select(Case).where(Case.zone == "kuning")).all()
    timely = [c for c in cases if c.first_contact_at and (c.first_contact_at - c.created_at).days <= 7]
    data["timeliness"] = {"yellow_total": len(cases), "timely": len(timely), "rate": round(len(timely) / len(cases), 2) if cases else None}
    return data


class FairnessFlagIn(BaseModel):
    group: str
    note: str


@router.post("/fairness/flag")
def flag_group(body: FairnessFlagIn, user: User = Depends(committee), db: Session = Depends(get_db)):
    audit.write(db, user, "tandai_keadilan", "keadilan", body.group, body.note[:300])
    return {"ok": True}


# ── E3 Hak data dan keberatan ───────────────────────────────────────────────


@router.get("/requests")
def requests_(user: User = Depends(require_role("komite", "bk")), db: Session = Depends(get_db)):
    now = utcnow()
    objs = db.scalars(select(Objection).order_by(Objection.status, Objection.due_at)).all()
    if user.role == "bk" and not user.is_coordinator:
        objs = [o for o in objs if db.get(Case, o.case_id).owner_id == user.id]
    reqs = db.scalars(select(DataRequest).order_by(DataRequest.status, DataRequest.due_at)).all() if user.role == "komite" else []
    return {
        "objections": [
            {
                "id": o.id,
                "case_id": o.case_id,
                "code": db.get(Subject, db.get(Case, o.case_id).subject_id).code,
                "status": o.status,
                "decision": o.decision,
                "created_at": o.created_at.isoformat(),
                "due_at": o.due_at.isoformat(),
                "overdue": o.status == "menunggu" and o.due_at < now,
            }
            for o in objs
        ],
        "data_requests": [
            {
                "id": r.id,
                "kind": r.kind,
                "status": r.status,
                "requester_role": db.get(User, r.requester_id).role,
                "created_at": r.created_at.isoformat(),
                "due_at": r.due_at.isoformat(),
                "overdue": r.status not in ("selesai", "ditolak") and r.due_at < now,
                "detail": r.detail,
            }
            for r in reqs
        ],
    }


@router.get("/objections/{oid}")
def objection(oid: int, user: User = Depends(require_role("komite", "bk")), db: Session = Depends(get_db)):
    o = db.get(Objection, oid)
    if o is None:
        raise HTTPException(404, "Keberatan tidak ditemukan")
    c = db.get(Case, o.case_id)
    if user.role == "bk" and not user.is_coordinator and c.owner_id != user.id:
        raise HTTPException(403, "Keberatan ini bukan untuk kasus Anda")
    # Identitas dibuka hanya dengan dasar kasus peninjauan; dicatat sebelum dikirim.
    audit.write(db, user, "tinjau_keberatan", "kasus", c.id)
    f = db.get(Flag, c.flag_id) if c.flag_id else None
    s = db.get(Subject, c.subject_id)
    student = user_for_subject(db, c.subject_id)
    return {
        "id": o.id,
        "case_id": c.id,
        "code": s.code,
        "student_name": student.name if student else None,
        "statement": o.statement,
        "status": o.status,
        "decision": o.decision,
        "reason": o.reason,
        "due_at": o.due_at.isoformat(),
        "evidence": reasons_json(f, for_role="komite"),
        "rule": f"{f.rule_id} v{f.rule_version}" if f else c.rule_id,
        "counterfactual": (f.counterfactual or {}).get("text") if f else None,
        "system_saw": ["Kehadiran", "Aktivitas belajar daring", "Tugas terlambat", "Nilai kuis"] if c.rule_id == "K1" else ["Check-in yang disetujui"],
        "system_not_saw": ["Isi pesan", "Media sosial", "Lokasi", "Keimanan"],
    }


class DecideIn(BaseModel):
    decision: str  # cabut | pertahankan | tinjau_aturan
    reason: str


@router.post("/objections/{oid}/decide")
def decide(oid: int, body: DecideIn, user: User = Depends(require_role("komite", "bk")), db: Session = Depends(get_db)):
    o = db.get(Objection, oid)
    if o is None:
        raise HTTPException(404, "Keberatan tidak ditemukan")
    if o.status != "menunggu":
        raise HTTPException(409, "Keberatan ini sudah diputus")
    if body.decision not in ("cabut", "pertahankan", "tinjau_aturan"):
        raise HTTPException(422, "Putusan tidak dikenal")
    if len(body.reason.strip()) < 10:
        raise HTTPException(422, "Tuliskan alasan putusan dalam bahasa sederhana (minimal 10 karakter)")
    c = db.get(Case, o.case_id)
    if user.role == "bk" and not user.is_coordinator and c.owner_id != user.id:
        raise HTTPException(403, "Keberatan ini bukan untuk kasus Anda")
    now = utcnow()
    o.status, o.decision, o.reason, o.reviewer_id, o.decided_at = "diputus", body.decision, body.reason.strip(), user.id, now
    if body.decision == "cabut":
        c.status = "ditutup"
        c.closed_at = now
        c.closed_reason = "Penandaan dicabut setelah keberatan"
        if c.flag_id:
            f = db.get(Flag, c.flag_id)
            f.active, f.released_at = False, now
    else:
        c.status = "baru" if c.first_contact_at is None else "disapa"
    if body.decision == "tinjau_aturan" and c.flag_id:
        f = db.get(Flag, c.flag_id)
        rv = db.scalars(select(RuleVersion).where(RuleVersion.rule_id == f.rule_id, RuleVersion.status == "aktif")).first()
        if rv:
            rv.reason = (rv.reason or "") + f"\n[Perlu ditinjau] Keberatan #{o.id}: {body.reason.strip()[:200]}"
    db.add(FollowUp(case_id=c.id, actor_id=user.id, action="putusan_keberatan", outcome={"cabut": "Penandaan dicabut", "pertahankan": "Penandaan dipertahankan dengan alasan", "tinjau_aturan": "Aturan ditandai untuk ditinjau"}[body.decision]))
    audit.write(db, user, "putus_keberatan", "kasus", c.id, body.decision, commit=False)
    db.commit()
    return {"ok": True}


class RequestPatch(BaseModel):
    status: str


@router.post("/data-requests/{rid}")
def update_request(rid: int, body: RequestPatch, user: User = Depends(committee), db: Session = Depends(get_db)):
    r = db.get(DataRequest, rid)
    if r is None:
        raise HTTPException(404, "Permintaan tidak ditemukan")
    if body.status not in ("diproses", "selesai", "ditolak"):
        raise HTTPException(422, "Status tidak dikenal")
    r.status = body.status
    if body.status in ("selesai", "ditolak"):
        r.done_at = utcnow()
    audit.write(db, user, "proses_hak_data", "permintaan", r.id, body.status, commit=False)
    db.commit()
    return {"ok": True}


# ── E4 Registri aturan dan XAI ──────────────────────────────────────────────


@router.get("/rules")
def registry(user: User = Depends(committee), db: Session = Depends(get_db)):
    rows = db.scalars(select(RuleVersion).order_by(RuleVersion.rule_id, RuleVersion.version.desc())).all()
    latest_run = db.scalars(select(XaiTest).order_by(XaiTest.run_at.desc())).first()
    tests = (
        db.scalars(select(XaiTest).where(XaiTest.run_at == latest_run.run_at)).all() if latest_run else []
    )
    return {
        "versions": [rule_json(db, r) for r in rows],
        "tests": [
            {"test": t.test, "value": t.value, "target": t.target, "passed": t.passed, "simulated": t.simulated, "detail": t.detail, "run_at": t.run_at.isoformat()}
            for t in tests
        ],
        "release_blocked": any(not t.passed for t in tests),
        "me": user.id,
    }


@router.post("/xai/run")
def run_tests(user: User = Depends(committee), db: Session = Depends(get_db)):
    results = run_xai_tests(db)
    audit.write(db, user, "jalankan_uji_xai", "aturan", None, ", ".join(f"{r.test}={r.value}" for r in results))
    return {"ok": True}


@router.post("/rules/{rid}/approve")
def approve(rid: int, user: User = Depends(committee), db: Session = Depends(get_db)):
    rv = db.get(RuleVersion, rid)
    if rv is None:
        raise HTTPException(404, "Versi aturan tidak ditemukan")
    if rv.status != "diajukan":
        raise HTTPException(409, "Hanya versi yang diajukan yang dapat disetujui")
    if rv.proposed_by == user.id:
        raise HTTPException(403, "Persetujuan 4 mata: pengusul tidak dapat menyetujui usulannya sendiri")
    latest = db.scalars(select(XaiTest).order_by(XaiTest.run_at.desc())).first()
    if latest:
        failing = db.scalars(select(XaiTest).where(XaiTest.run_at == latest.run_at, XaiTest.passed.is_(False))).all()
        if failing:
            raise HTTPException(409, "Uji kualitas penjelasan belum lolos. Rilis aturan tertahan.")
    for old in db.scalars(select(RuleVersion).where(RuleVersion.rule_id == rv.rule_id, RuleVersion.status == "aktif")):
        old.status = "arsip"
    rv.status, rv.approved_by, rv.decided_at = "aktif", user.id, utcnow()
    audit.write(db, user, "setujui_aturan", "aturan", f"{rv.rule_id} v{rv.version}", commit=False)
    db.commit()
    return rule_json(db, rv)


@router.post("/rules/{rid}/reject")
def reject(rid: int, user: User = Depends(committee), db: Session = Depends(get_db)):
    rv = db.get(RuleVersion, rid)
    if rv is None or rv.status != "diajukan":
        raise HTTPException(409, "Hanya versi yang diajukan yang dapat ditolak")
    rv.status, rv.approved_by, rv.decided_at = "ditolak", user.id, utcnow()
    audit.write(db, user, "tolak_aturan", "aturan", f"{rv.rule_id} v{rv.version}", commit=False)
    db.commit()
    return rule_json(db, rv)
