"""Layar siswa S1–S7 dan mode anak S1-A, S3-A."""
from __future__ import annotations

import json
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from .. import audit, content
from ..access import (
    consent_state,
    needs_guardian,
    needs_reconfirm,
    processing_allowed,
    subject_for,
)
from ..db import get_db
from ..models import (
    AuditLog,
    Case,
    CheckinResponse,
    Consent,
    DataRequest,
    Feeling,
    Flag,
    LibraryItem,
    Objection,
    Relation,
    User,
    WeeklyIndicator,
)
from ..security import decrypt, encrypt, require_role
from ..services import (
    create_flag_and_case,
    evaluate_subject,
    follow_ups,
    homeroom_teacher,
    open_case_for,
    reasons_json,
    withdraw_all,
)
from ..timeutil import utcnow
from .common import contacts as contacts_endpoint

router = APIRouter(prefix="/api/me", tags=["siswa"])
student_only = require_role("siswa")

DATA_LABELS = {
    "kehadiran": ("Kehadiran", "Jumlah hari hadir per pekan"),
    "lms": ("Aktivitas belajar daring", "Berapa kali kamu membuka materi, bukan isinya"),
    "tugas": ("Tugas terlambat", "Jumlah tugas yang terlambat dikumpulkan"),
    "kuis": ("Nilai kuis", "Tren nilai, bukan peringkat"),
    "checkin": ("Check-in mingguan", "Jawaban pertanyaan singkat yang kamu isi sendiri"),
    "bk_baca_checkin": ("Guru BK boleh membaca jawaban check-in", "Hanya guru BK, tidak pernah guru kelas"),
}

NOT_READ = ["Isi pesan dan percakapan", "Media sosial", "Lokasi dan aplikasi ponsel", "Keimanan atau ibadahmu"]

ACTION_LABELS = {
    "buka_kasus": "membuka detail pendampinganmu",
    "baca_checkin": "membaca jawaban check-in yang kamu izinkan",
    "tulis_catatan": "menulis catatan sesi",
    "catat_tindakan": "mencatat langkah pendampingan",
    "tinjau_keberatan": "meninjau keberatanmu",
    "unduh_data": "mengunduh salinan datamu",
    "ambil_kasus": "mulai menangani pendampinganmu",
}
ROLE_LABELS = {"guru": "Wali kelas", "bk": "Guru BK", "komite": "Komite etik", "siswa": "Kamu", "wali": "Wali", "admin": "Admin"}

CHILD_SENTENCES = {
    "kehadiran": "beberapa pekan ini kamu lebih sering tidak masuk sekolah",
    "lms": "akhir-akhir ini kamu jarang membuka materi belajar",
    "tugas": "akhir-akhir ini beberapa tugasmu terlambat",
    "kuis": "akhir-akhir ini belajar sepertinya terasa lebih berat",
    "checkin": "kamu mungkin sedang capek",
}


def _subject_or_404(db: Session, user: User):
    s = subject_for(db, user)
    if s is None:
        raise HTTPException(404, "Data siswa belum terhubung")
    return s


def _current_week(db: Session, subject_id: int) -> int:
    w = db.scalar(
        select(WeeklyIndicator.week).where(WeeklyIndicator.subject_id == subject_id).order_by(WeeklyIndicator.week.desc())
    )
    return w or 1


def _consent_view(db: Session, user: User) -> dict:
    st = consent_state(db, user.id)
    guardian = needs_guardian(user)
    items = []
    for dt, (label, desc) in DATA_LABELS.items():
        s = st[dt]
        own = s["asen"] if guardian else s["persetujuan"]
        items.append(
            {
                "type": dt,
                "label": label,
                "description": desc,
                "granted": bool(own),
                "guardian_granted": bool(s["persetujuan"]) if guardian else None,
                "since": s["since"].isoformat() if s["since"] and own else None,
                "effective": processing_allowed(db, user, dt),
            }
        )
    history = db.scalars(
        select(Consent).where(Consent.student_id == user.id).order_by(Consent.at.desc(), Consent.id.desc()).limit(30)
    ).all()
    return {
        "items": items,
        "needs_guardian": guardian,
        "needs_reconfirm": needs_reconfirm(db, user),
        "guardian_pending": guardian and not any(st[dt]["persetujuan"] for dt in DATA_LABELS),
        "any_granted": any(i["granted"] for i in items),
        "not_read": NOT_READ,
        "purpose": "Satu tujuan saja: agar guru dan guru BK bisa menyapamu lebih awal bila beberapa hal berubah.",
        "duration": "Berlaku sampai akhir Semester Ganjil 2026/2027. Kamu bisa mengubahnya kapan saja.",
        "history": [
            {
                "type": h.data_type,
                "label": DATA_LABELS.get(h.data_type, (h.data_type,))[0],
                "kind": h.kind,
                "granted": h.granted,
                "by": "Kamu" if h.actor_id == user.id else "Wali",
                "at": h.at.isoformat(),
            }
            for h in history
        ],
    }


def _teacher_title(db: Session, user: User, case: Case | None) -> str:
    """Nama penyapa. Bila siswa belum punya wali kelas/dosen PA, kasus dipegang BK."""
    owner = db.get(User, case.owner_id) if case and case.owner_id else homeroom_teacher(db, user)
    return (owner.title or owner.nickname) if owner else "Guru BK"


@router.get("/home")
def home(user: User = Depends(student_only), db: Session = Depends(get_db)):
    s = _subject_or_404(db, user)
    case = open_case_for(db, s.id)
    week = _current_week(db, s.id)
    done = db.scalar(select(CheckinResponse.id).where(CheckinResponse.subject_id == s.id, CheckinResponse.week == week))
    message = None
    if case and case.zone == "kuning" and case.student_response is None and case.status in ("baru", "disapa", "terlambat"):
        who = _teacher_title(db, user, case)
        message = {
            "case_id": case.id,
            "from": who,
            "text": (f"{who} ingin ngobrol sebentar denganmu." if user.ui_mode == "anak" else f"Ada beberapa hal yang berubah. {who} ingin menyapa."),
        }
    picks = db.scalars(select(LibraryItem).where(LibraryItem.status == "terbit").order_by(LibraryItem.id).limit(3)).all()
    cv = _consent_view(db, user)
    has_data = db.scalar(select(WeeklyIndicator.id).where(WeeklyIndicator.subject_id == s.id)) is not None
    return {
        "nickname": user.nickname,
        "mode": user.ui_mode,
        "week": week if has_data else None,
        "consent": {
            "any": cv["any_granted"],
            "needs_reconfirm": cv["needs_reconfirm"],
            "guardian_pending": cv["guardian_pending"],
        },
        "checkin": {"consented": processing_allowed(db, user, "checkin"), "done": bool(done)},
        "message": message,
        "has_red": bool(case and case.zone == "merah"),
        "objection_pending": bool(case and case.status == "ditinjau"),
        "library": [{"id": i.id, "title": i.title, "kind": i.kind, "label": i.label, "minutes": i.minutes, "category": i.category} for i in picks],
    }


@router.get("/consent")
def get_consent(user: User = Depends(student_only), db: Session = Depends(get_db)):
    return _consent_view(db, user)


class ConsentIn(BaseModel):
    choices: dict[str, bool]


@router.post("/consent")
def set_consent(body: ConsentIn, user: User = Depends(student_only), db: Session = Depends(get_db)):
    st = consent_state(db, user.id)
    guardian = needs_guardian(user)
    kind = "asen" if guardian else "persetujuan"
    reconfirm = needs_reconfirm(db, user)
    now = utcnow()
    changed = 0
    for dt, granted in body.choices.items():
        if dt not in DATA_LABELS:
            raise HTTPException(422, f"Jenis data tidak dikenal: {dt}")
        if st[dt][kind] == granted and not reconfirm:
            continue
        db.add(Consent(student_id=user.id, data_type=dt, kind=kind, granted=granted, actor_id=user.id, at=now))
        changed += 1
    audit.write(db, user, "ubah_persetujuan", "siswa", user.id, f"{changed} perubahan ({kind})", commit=False)
    db.commit()
    s = subject_for(db, user)
    closed = 0
    if s and not any(processing_allowed(db, user, dt) for dt in ("kehadiran", "lms", "tugas", "kuis", "checkin")):
        from ..services import close_open_cases

        closed = close_open_cases(db, s.id, "Persetujuan ditarik", user)
        db.commit()
    return {"ok": True, "changed": changed, "closed_cases": closed, "consent": _consent_view(db, user)}


@router.get("/flag")
def flag(user: User = Depends(student_only), db: Session = Depends(get_db)):
    s = _subject_or_404(db, user)
    case = open_case_for(db, s.id)
    if case is None:
        return {"zone": "hijau", "message": "Tidak ada penandaan saat ini. Kalau ingin cerita, pintu BK tetap terbuka."}
    who = _teacher_title(db, user, case)
    f = db.get(Flag, case.flag_id) if case.flag_id else None
    obj = db.scalars(select(Objection).where(Objection.case_id == case.id).order_by(Objection.id.desc())).first()
    objection = (
        {"status": obj.status, "decision": obj.decision, "reason": obj.reason, "created_at": obj.created_at.isoformat()}
        if obj
        else None
    )
    # Aturan wajib 14.3.10: mode anak tidak pernah menerima zona, angka, atau kata "ditandai".
    if user.ui_mode == "anak":
        top = f.reasons[0].indicator if f and f.reasons else "checkin"
        if case.zone == "merah":
            return {"child": True, "redirect": "bantuan"}
        return {
            "child": True,
            "case_id": case.id,
            "teacher": who,
            "sentence": f"{who} ingin menyapamu karena {CHILD_SENTENCES.get(top, CHILD_SENTENCES['checkin'])}.",
            "response": case.student_response,
            "objection": objection,
        }
    if case.zone == "merah":
        return {"zone": "merah", "redirect": "bantuan", "case_id": case.id}
    used = [DATA_LABELS[dt][0] for dt in ("kehadiran", "lms", "tugas", "kuis", "checkin") if processing_allowed(db, user, dt)]
    return {
        "zone": case.zone,
        "rule_id": case.rule_id,
        "case_id": case.id,
        "status": case.status,
        "teacher": who,
        "response": case.student_response,
        "reasons": reasons_json(f, for_role="siswa"),
        "counterfactual": (f.counterfactual or {}).get("text") if f else None,
        "data_used": used,
        "objection": objection,
        "flagged_at": case.created_at.isoformat(),
        "flag_week": f.week if f else None,
    }


class RespondIn(BaseModel):
    response: str  # mau | belum_mau


@router.post("/flag/respond")
def respond(body: RespondIn, user: User = Depends(student_only), db: Session = Depends(get_db)):
    if body.response not in ("mau", "belum_mau"):
        raise HTTPException(422, "Pilihan tidak dikenal")
    s = _subject_or_404(db, user)
    case = open_case_for(db, s.id)
    if case is None or case.zone != "kuning":
        raise HTTPException(404, "Tidak ada sapaan yang menunggu")
    case.student_response = body.response
    from ..models import FollowUp

    db.add(FollowUp(case_id=case.id, actor_id=user.id, action="tanggapan_siswa", outcome="Mau disapa" if body.response == "mau" else "Belum mau, sapaan ditunda"))
    db.commit()
    return {"ok": True, "response": body.response}


class ObjectionIn(BaseModel):
    statement: str = ""


@router.post("/objection")
def objection(body: ObjectionIn, user: User = Depends(student_only), db: Session = Depends(get_db)):
    s = _subject_or_404(db, user)
    case = open_case_for(db, s.id)
    if case is None:
        raise HTTPException(404, "Tidak ada penandaan yang bisa disanggah")
    text = body.statement.strip() or ("Itu tidak benar." if user.ui_mode == "anak" else "Penandaan ini tidak sesuai dengan keadaanku.")
    now = utcnow()
    o = Objection(case_id=case.id, student_id=user.id, statement=text[:2000], created_at=now, due_at=now + timedelta(days=14))
    case.status = "ditinjau"
    db.add(o)
    from ..models import FollowUp

    db.add(FollowUp(case_id=case.id, actor_id=user.id, action="keberatan", outcome="Siswa mengajukan keberatan"))
    audit.write(db, user, "ajukan_keberatan", "kasus", case.id, commit=False)
    db.commit()
    return {"ok": True, "status": "menunggu"}


@router.get("/checkin")
def get_checkin(user: User = Depends(student_only), db: Session = Depends(get_db)):
    s = _subject_or_404(db, user)
    week = _current_week(db, s.id)
    done = db.scalar(select(CheckinResponse.id).where(CheckinResponse.subject_id == s.id, CheckinResponse.week == week))
    return {
        "consented": processing_allowed(db, user, "checkin"),
        "done": bool(done),
        "week": week,
        "items": content.CHECKIN_ITEMS,
        "choices": content.CHECKIN_CHOICES,
        "safety": content.SAFETY_ITEM,
        "note": content.CHECKIN_NOTE,
        "bk_can_read": processing_allowed(db, user, "bk_baca_checkin"),
    }


class CheckinIn(BaseModel):
    answers: dict[str, int | None]
    safety: bool | None = None


@router.post("/checkin")
def post_checkin(body: CheckinIn, user: User = Depends(student_only), db: Session = Depends(get_db)):
    s = _subject_or_404(db, user)
    if not processing_allowed(db, user, "checkin"):
        raise HTTPException(409, "Kamu belum mengizinkan check-in. Kamu bisa mengaktifkannya di Persetujuan.")
    valid_ids = {i["id"] for i in content.CHECKIN_ITEMS}
    for k, v in body.answers.items():
        if k not in valid_ids or (v is not None and v not in (0, 1, 2, 3)):
            raise HTTPException(422, "Jawaban tidak valid")
    score = sum(v for v in body.answers.values() if v is not None)
    week = _current_week(db, s.id)
    existing = db.scalars(select(CheckinResponse).where(CheckinResponse.subject_id == s.id, CheckinResponse.week == week)).first()
    payload = json.dumps({"answers": body.answers, "safety": body.safety})
    if existing:
        existing.answers_enc, existing.score_enc, existing.safety = encrypt(payload), encrypt(str(score)), bool(body.safety)
    else:
        db.add(CheckinResponse(subject_id=s.id, week=week, answers_enc=encrypt(payload), score_enc=encrypt(str(score)), safety=bool(body.safety)))
    audit.write(db, user, "isi_checkin", "checkin", s.code, "Isi tidak dicatat di log", technical=True, commit=False)
    db.commit()

    redirect = None
    ev = evaluate_subject(db, s)
    case = open_case_for(db, s.id)
    if ev and ev.zone == "merah" and not (case and case.zone == "merah"):
        create_flag_and_case(db, s, ev, week=week)
        db.commit()
        redirect = "bantuan"
    elif ev and ev.zone == "kuning" and case is None:
        create_flag_and_case(db, s, ev, week=week)
        db.commit()
    elif ev and ev.zone == "merah":
        redirect = "bantuan"
    return {"ok": True, "redirect": redirect}


@router.post("/help")
def help_now(user: User = Depends(student_only), db: Session = Depends(get_db)):
    """S7: selalu tersedia, termasuk bila persetujuan ditarik."""
    s = _subject_or_404(db, user)
    case = open_case_for(db, s.id)
    if not (case and case.zone == "merah"):
        ev = evaluate_subject(db, s, help_pressed=True)
        create_flag_and_case(db, s, ev, week=_current_week(db, s.id))
    audit.write(db, user, "tekan_bantuan", "siswa", user.id, "Antrean merah BK dibuka", commit=False)
    db.commit()
    return {"ok": True, "queued": True}


@router.get("/privacy")
def privacy(user: User = Depends(student_only), db: Session = Depends(get_db)):
    s = _subject_or_404(db, user)
    case_ids = [str(c) for c in db.scalars(select(Case.id).where(Case.subject_id == s.id))]
    logs = db.scalars(
        select(AuditLog)
        .where(
            or_(
                and_(AuditLog.object_type == "siswa", AuditLog.object_id == str(user.id)),
                and_(AuditLog.object_type == "kasus", AuditLog.object_id.in_(case_ids or ["-"])),
            ),
            AuditLog.actor_id != user.id,
        )
        .order_by(AuditLog.id.desc())
        .limit(20)
    ).all()
    reqs = db.scalars(select(DataRequest).where(DataRequest.student_id == user.id).order_by(DataRequest.id.desc())).all()
    return {
        "consent": _consent_view(db, user),
        "high_contrast": user.high_contrast,
        "access_log": [
            {
                "who": l.actor_label,
                "role": ROLE_LABELS.get(l.actor_role, l.actor_role),
                "what": ACTION_LABELS.get(l.action, l.action.replace("_", " ")),
                "at": l.at.isoformat(),
            }
            for l in logs
        ],
        "requests": [
            {"id": r.id, "kind": r.kind, "status": r.status, "created_at": r.created_at.isoformat(), "due_at": r.due_at.isoformat()}
            for r in reqs
        ],
    }


class SettingsIn(BaseModel):
    high_contrast: bool


@router.post("/settings")
def settings_(body: SettingsIn, user: User = Depends(student_only), db: Session = Depends(get_db)):
    user.high_contrast = body.high_contrast
    db.commit()
    return {"ok": True, "high_contrast": user.high_contrast}


class RequestIn(BaseModel):
    kind: str
    detail: str = ""


@router.post("/requests")
def create_request(body: RequestIn, user: User = Depends(student_only), db: Session = Depends(get_db)):
    if body.kind not in ("hapus", "perbaiki", "lihat"):
        raise HTTPException(422, "Jenis permintaan tidak dikenal")
    now = utcnow()
    r = DataRequest(
        student_id=user.id,
        requester_id=user.id,
        kind=body.kind,
        status="diproses" if body.kind == "hapus" else "diajukan",
        detail=body.detail[:1000] or None,
        created_at=now,
        due_at=now + timedelta(days=14),
    )
    db.add(r)
    audit.write(db, user, f"minta_{body.kind}", "siswa", user.id, commit=False)
    db.commit()
    return {"ok": True, "id": r.id, "status": r.status}


def export_payload(db: Session, student: User) -> dict:
    s = subject_for(db, student)
    weeks = db.scalars(select(WeeklyIndicator).where(WeeklyIndicator.subject_id == s.id).order_by(WeeklyIndicator.week)).all() if s else []
    checkins = db.scalars(select(CheckinResponse).where(CheckinResponse.subject_id == s.id)).all() if s else []
    flags = db.scalars(select(Flag).where(Flag.subject_id == s.id)).all() if s else []
    cases = db.scalars(select(Case).where(Case.subject_id == s.id)).all() if s else []
    allowed = {dt: processing_allowed(db, student, dt) for dt in ("kehadiran", "lms", "tugas", "kuis")}
    return {
        "label": "SIMULASI — salinan data pribadi Ri'ayah",
        "dibuat": utcnow().isoformat(timespec="seconds"),
        "profil": {"nama": student.name, "kelas": student.class_name, "jenjang": student.level},
        "persetujuan": _consent_view(db, student)["history"],
        "indikator_mingguan": [
            {"pekan": w.week, **{k: getattr(w, k) for k in allowed if allowed[k]}} for w in weeks
        ],
        "checkin": [{"pekan": c.week, "isi": json.loads(decrypt(c.answers_enc))} for c in checkins],
        "penandaan": [
            {"pekan": f.week, "zona": f.zone, "aturan": f.rule_id, "alasan": [r.text for r in f.reasons], "aktif": f.active}
            for f in flags
        ],
        "kasus": [
            {"status": c.status, "dibuat": c.created_at.isoformat(), "riwayat": follow_ups(db, c.id)} for c in cases
        ],
        "tidak_disimpan": NOT_READ,
    }


@router.get("/export")
def export(user: User = Depends(student_only), db: Session = Depends(get_db)):
    audit.write(db, user, "unduh_data", "siswa", user.id)
    return JSONResponse(
        export_payload(db, user),
        headers={"Content-Disposition": 'attachment; filename="data-riayah-saya.json"'},
    )


@router.post("/withdraw")
def withdraw(user: User = Depends(student_only), db: Session = Depends(get_db)):
    s = subject_for(db, user)
    return withdraw_all(db, user, user, s.id if s else None)


class FeelingIn(BaseModel):
    feeling: str


@router.post("/feeling")
def feeling(body: FeelingIn, user: User = Depends(student_only), db: Session = Depends(get_db)):
    if body.feeling not in ("senang", "biasa", "capek", "sedih", "kesal"):
        raise HTTPException(422, "Pilihan tidak dikenal")
    s = _subject_or_404(db, user)
    db.add(Feeling(subject_id=s.id, feeling=body.feeling))
    db.commit()
    return {"ok": True}


@router.get("/help-contacts")
def help_contacts(user: User = Depends(student_only), db: Session = Depends(get_db)):
    return contacts_endpoint(user, db)
