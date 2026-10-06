"""Kontak darurat, jam layanan, dan pustaka: dapat dibaca semua peran yang masuk."""
from __future__ import annotations

from datetime import datetime, timedelta

from ..timeutil import utcnow

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import EmergencyContact, LibraryItem, ServiceHours, User
from ..security import current_user

router = APIRouter(prefix="/api", tags=["umum"])

DAYS = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"]


def local_now() -> datetime:
    """Waktu lokal WIB (UTC+7) untuk jam layanan."""
    return utcnow() + timedelta(hours=7)


def hours_json(db: Session) -> dict:
    rows = db.scalars(select(ServiceHours).order_by(ServiceHours.weekday)).all()
    now = local_now()
    today = next((r for r in rows if r.weekday == now.weekday()), None)
    is_open = False
    if today and today.open_time and today.close_time:
        hm = now.strftime("%H:%M")
        is_open = today.open_time <= hm < today.close_time
    return {
        "days": [
            {"weekday": r.weekday, "day": DAYS[r.weekday], "open": r.open_time, "close": r.close_time}
            for r in rows
        ],
        "is_open_now": is_open,
        "today": {"open": today.open_time, "close": today.close_time} if today else None,
    }


def contact_json(c: EmergencyContact, *, admin_view: bool) -> dict:
    d = {"id": c.id, "name": c.name, "kind": c.kind, "hours": c.hours, "note": c.note}
    if c.verified and c.phone:
        d["phone"] = c.phone
        d["status"] = "aktif"
    else:
        d["phone"] = c.phone if admin_view else None
        d["status"] = "belum_diisi"
    return d


@router.get("/contacts")
def contacts(user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Aturan wajib 14.3.6: nomor yang belum diverifikasi tidak pernah tampil ke siswa atau wali."""
    staff = user.role in ("admin", "bk")
    rows = db.scalars(select(EmergencyContact).order_by(EmergencyContact.id)).all()
    visible = [contact_json(c, admin_view=staff) for c in rows if staff or (c.verified and c.phone)]
    missing = sum(1 for c in rows if not (c.verified and c.phone))
    return {
        "contacts": visible,
        "hours": hours_json(db),
        "missing_count": missing if staff else None,
        "disclaimer": "Ri'ayah bukan layanan darurat. Bila nyawa terancam, hubungi layanan darurat setempat.",
    }


@router.get("/library")
def library(q: str = "", category: str = "", user: User = Depends(current_user), db: Session = Depends(get_db)):
    stmt = select(LibraryItem).where(LibraryItem.status == "terbit")
    if category:
        stmt = stmt.where(LibraryItem.category == category)
    if q.strip():
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(LibraryItem.title.ilike(like), LibraryItem.summary.ilike(like)))
    items = db.scalars(stmt.order_by(LibraryItem.id)).all()
    cats = sorted({c for c in db.scalars(select(LibraryItem.category).where(LibraryItem.status == "terbit"))})
    return {
        "categories": cats,
        "items": [
            {
                "id": i.id,
                "title": i.title,
                "kind": i.kind,
                "category": i.category,
                "source": i.source,
                "label": i.label,
                "minutes": i.minutes,
                "summary": i.summary,
                "dalil_count": len(i.dalil or []),
            }
            for i in items
        ],
    }


@router.get("/library/{item_id}")
def library_item(item_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    i = db.get(LibraryItem, item_id)
    if i is None or (i.status != "terbit" and user.role != "admin"):
        raise HTTPException(404, "Konten tidak ditemukan")
    return {
        "id": i.id,
        "title": i.title,
        "kind": i.kind,
        "category": i.category,
        "source": i.source,
        "label": i.label,
        "minutes": i.minutes,
        "summary": i.summary,
        "body": i.body,
        "reviewed_by": i.reviewed_by,
        "dalil": i.dalil or [],
    }
