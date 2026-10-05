"""“Cerita lewat tulisan”: siswa menulis ke guru BK tanpa harus bertemu.

Prinsip:
- Dibalas manusia (guru BK), bukan AI. Ri'ayah tidak menganalisis isi pesan.
- Selalu tersedia, termasuk bila persetujuan data ditarik, karena siswa sendiri yang memulai.
- Isi pesan terenkripsi; hanya siswa dan guru BK yang menangani yang bisa membaca.
  Wali kelas, orang tua, admin, dan pimpinan tidak bisa membuka percakapan ini.
- Siswa bisa menandai "mendesak"; itu membuka antrean merah BK (setara tombol bantuan).
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import audit, rules
from ..access import subject_for
from ..db import get_db
from ..models import StoryMessage, StoryThread, User
from ..security import decrypt, encrypt, require_role
from ..services import create_flag_and_case, open_case_for
from ..timeutil import utcnow

router = APIRouter(prefix="/api", tags=["cerita"])
student_only = require_role("siswa")
bk_only = require_role("bk")

MAX_LEN = 3000


def _messages(db: Session, t: StoryThread) -> list[dict]:
    rows = db.scalars(select(StoryMessage).where(StoryMessage.thread_id == t.id).order_by(StoryMessage.at, StoryMessage.id)).all()
    out = []
    for m in rows:
        author = db.get(User, m.author_id)
        out.append(
            {
                "id": m.id,
                "from": m.from_role,
                "author": (author.title or author.nickname) if author else "-",
                "body": decrypt(m.body_enc),
                "at": m.at.isoformat(),
                "read": m.read,
            }
        )
    return out


def _thread_json(db: Session, t: StoryThread, viewer_role: str) -> dict:
    counselor = db.get(User, t.counselor_id) if t.counselor_id else None
    unread = db.scalar(
        select(func.count()).select_from(StoryMessage).where(
            StoryMessage.thread_id == t.id, StoryMessage.read.is_(False), StoryMessage.from_role != viewer_role
        )
    )
    return {
        "id": t.id,
        "status": t.status,
        "urgent": t.urgent,
        "counselor": counselor.title if counselor else None,
        "created_at": t.created_at.isoformat(),
        "last_at": t.last_at.isoformat(),
        "unread": unread,
    }


def _mark_read(db: Session, t: StoryThread, viewer_role: str) -> None:
    for m in db.scalars(select(StoryMessage).where(StoryMessage.thread_id == t.id, StoryMessage.read.is_(False), StoryMessage.from_role != viewer_role)):
        m.read = True


def _clean(body: str) -> str:
    text = body.strip()
    if not text:
        raise HTTPException(422, "Pesannya masih kosong")
    if len(text) > MAX_LEN:
        raise HTTPException(422, f"Pesan terlalu panjang (maksimal {MAX_LEN} karakter). Kirim dalam beberapa pesan.")
    return text


# ── Siswa ───────────────────────────────────────────────────────────────────


@router.get("/me/stories")
def my_stories(user: User = Depends(student_only), db: Session = Depends(get_db)):
    threads = db.scalars(select(StoryThread).where(StoryThread.student_id == user.id).order_by(StoryThread.last_at.desc())).all()
    current = next((t for t in threads if t.status == "terbuka"), None)
    data = {
        "current": None,
        "history": [_thread_json(db, t, "siswa") for t in threads if t is not current],
    }
    if current:
        data["current"] = {**_thread_json(db, current, "siswa"), "messages": _messages(db, current)}
        _mark_read(db, current, "siswa")
        db.commit()
    return data


class StoryIn(BaseModel):
    body: str
    urgent: bool = False


@router.post("/me/stories")
def send_story(body: StoryIn, user: User = Depends(student_only), db: Session = Depends(get_db)):
    text = _clean(body.body)
    now = utcnow()
    t = db.scalars(select(StoryThread).where(StoryThread.student_id == user.id, StoryThread.status == "terbuka")).first()
    if t is None:
        t = StoryThread(student_id=user.id, created_at=now, last_at=now)
        db.add(t)
        db.flush()
    t.last_at = now
    db.add(StoryMessage(thread_id=t.id, author_id=user.id, from_role="siswa", body_enc=encrypt(text), at=now))
    queued_red = False
    if body.urgent and not t.urgent:
        t.urgent = True
        s = subject_for(db, user)
        case = open_case_for(db, s.id) if s else None
        if s and not (case and case.zone == "merah"):
            reason = rules.ReasonOut("bantuan", "Pesan mendesak", "Siswa menandai pesannya sebagai mendesak.", "Dari Cerita lewat tulisan", [], None, 1.0)
            create_flag_and_case(db, s, rules.Evaluation("merah", "M1", [reason]), week=0)
            queued_red = True
    audit.write(db, user, "kirim_cerita", "cerita", t.id, "Isi tidak dicatat di log", commit=False)
    db.commit()
    return {"ok": True, "thread_id": t.id, "urgent_queued": queued_red}


@router.post("/me/stories/close")
def close_my_story(user: User = Depends(student_only), db: Session = Depends(get_db)):
    t = db.scalars(select(StoryThread).where(StoryThread.student_id == user.id, StoryThread.status == "terbuka")).first()
    if t:
        t.status = "selesai"
        db.commit()
    return {"ok": True}


# ── Guru BK ─────────────────────────────────────────────────────────────────


def _bk_can_see(user: User, t: StoryThread) -> bool:
    return user.is_coordinator or t.counselor_id in (None, user.id)


@router.get("/counselor/stories")
def bk_stories(user: User = Depends(bk_only), db: Session = Depends(get_db)):
    threads = db.scalars(select(StoryThread).order_by(StoryThread.urgent.desc(), StoryThread.last_at.desc())).all()
    rows = []
    for t in threads:
        if not _bk_can_see(user, t):
            continue
        s = db.get(User, t.student_id)
        rows.append({**_thread_json(db, t, "bk"), "student": s.name, "class_name": s.class_name, "mine": t.counselor_id == user.id})
    return {"rows": rows, "unread_total": sum(r["unread"] for r in rows if r["status"] == "terbuka")}


@router.get("/counselor/stories/{tid}")
def bk_story(tid: int, user: User = Depends(bk_only), db: Session = Depends(get_db)):
    t = db.get(StoryThread, tid)
    if t is None:
        raise HTTPException(404, "Percakapan tidak ditemukan")
    if not _bk_can_see(user, t):
        raise HTTPException(403, "Percakapan ini ditangani guru BK lain")
    # Log dulu sebelum isi dikirim (aturan wajib 14.3.4).
    audit.write(db, user, "baca_cerita", "siswa", t.student_id, commit=False)
    s = db.get(User, t.student_id)
    data = {**_thread_json(db, t, "bk"), "student": s.name, "class_name": s.class_name, "messages": _messages(db, t)}
    _mark_read(db, t, "bk")
    db.commit()
    return data


class ReplyIn(BaseModel):
    body: str


@router.post("/counselor/stories/{tid}/reply")
def bk_reply(tid: int, body: ReplyIn, user: User = Depends(bk_only), db: Session = Depends(get_db)):
    t = db.get(StoryThread, tid)
    if t is None:
        raise HTTPException(404, "Percakapan tidak ditemukan")
    if not _bk_can_see(user, t):
        raise HTTPException(403, "Percakapan ini ditangani guru BK lain")
    if t.status != "terbuka":
        raise HTTPException(409, "Percakapan sudah selesai")
    text = _clean(body.body)
    now = utcnow()
    if t.counselor_id is None:
        t.counselor_id = user.id
    t.last_at = now
    db.add(StoryMessage(thread_id=t.id, author_id=user.id, from_role="bk", body_enc=encrypt(text), at=now))
    audit.write(db, user, "balas_cerita", "siswa", t.student_id, commit=False)
    db.commit()
    return {"ok": True}


@router.post("/counselor/stories/{tid}/close")
def bk_close(tid: int, user: User = Depends(bk_only), db: Session = Depends(get_db)):
    t = db.get(StoryThread, tid)
    if t is None or not _bk_can_see(user, t):
        raise HTTPException(404, "Percakapan tidak ditemukan")
    t.status = "selesai"
    db.commit()
    return {"ok": True}
