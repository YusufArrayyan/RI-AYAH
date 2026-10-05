from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import audit
from ..access import needs_reconfirm
from ..config import settings
from ..db import get_db
from ..models import Institution, User
from ..security import create_token, current_user, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginIn(BaseModel):
    email: str
    password: str


class DemoIn(BaseModel):
    email: str


def user_json(db: Session, u: User) -> dict:
    inst = db.get(Institution, u.institution_id)
    return {
        "id": u.id,
        "name": u.name,
        "nickname": u.nickname,
        "title": u.title,
        "role": u.role,
        "level": u.level,
        "class_name": u.class_name,
        "ui_mode": u.ui_mode,
        "high_contrast": u.high_contrast,
        "is_coordinator": u.is_coordinator,
        "institution": {"name": inst.name, "kind": inst.kind} if inst else None,
        "needs_reconfirm": needs_reconfirm(db, u) if u.role == "siswa" else False,
        "environment": settings.environment,
    }


def _session(db: Session, u: User) -> dict:
    audit.write(db, u, "masuk", "sesi", u.id, technical=True)
    return {"token": create_token(u), "user": user_json(db, u)}


@router.post("/login")
def login(body: LoginIn, db: Session = Depends(get_db)):
    u = db.scalar(select(User).where(User.email == body.email.strip().lower()))
    if u is None or not u.active or not verify_password(body.password, u.password_hash):
        raise HTTPException(401, "Email atau kata sandi tidak cocok")
    return _session(db, u)


DEMO_DESCRIPTIONS = {
    "siswa": "Siswa atau mahasiswa · ponsel",
    "wali": "Orang tua atau wali · ponsel",
    "guru": "Guru wali kelas atau dosen PA · desktop",
    "bk": "Guru BK atau konselor · desktop",
    "admin": "Admin sekolah atau TI · desktop",
    "pimpinan": "Pimpinan · desktop",
    "komite": "Komite etik dan DPO · desktop",
}


@router.get("/demo-accounts")
def demo_accounts(db: Session = Depends(get_db)):
    """Daftar akun SIMULASI untuk demo. Tidak tersedia di produksi."""
    if settings.is_production:
        raise HTTPException(404)
    users = db.scalars(select(User).where(User.email.like("%@demo.riayah.id")).order_by(User.id)).all()
    return [
        {
            "email": u.email,
            "name": u.name,
            "title": u.title,
            "role": u.role,
            "ui_mode": u.ui_mode,
            "class_name": u.class_name,
            "description": DEMO_DESCRIPTIONS[u.role],
        }
        for u in users
    ]


@router.post("/demo-login")
def demo_login(body: DemoIn, db: Session = Depends(get_db)):
    """Masuk tanpa kata sandi untuk akun SIMULASI. Produksi memakai SSO (OIDC)."""
    if settings.is_production:
        raise HTTPException(404)
    u = db.scalar(select(User).where(User.email == body.email, User.email.like("%@demo.riayah.id")))
    if u is None or not u.active:
        raise HTTPException(404, "Akun demo tidak ditemukan")
    return _session(db, u)


@router.get("/me")
def me(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return user_json(db, user)
