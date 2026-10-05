"""Masuk dan pendaftaran akun.

Prototipe memakai akun email dan kata sandi. Produksi memakai SSO sekolah (OIDC) sehingga
tidak ada kata sandi baru (PRD Bab 10.2); `current_user` tetap menjadi satu-satunya pintu.

Aturan pendaftaran:
- Siswa/mahasiswa langsung aktif. Data baru dibaca setelah persetujuan (S2), dan untuk siswa
  di bawah 18 tahun juga setelah persetujuan wali.
- Orang tua/wali langsung aktif, tetapi hubungan dengan anak berstatus menunggu verifikasi
  sekolah (A2) sebelum wali melihat apa pun tentang anak.
- Peran staf (guru, BK, admin, pimpinan, komite) menunggu persetujuan admin, karena peran
  yang membuka akses ke data siswa tidak boleh mengaktifkan dirinya sendiri.
"""
from __future__ import annotations

import re
import secrets
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import audit, codes
from ..access import age_on, needs_reconfirm
from ..config import settings
from ..db import get_db
from ..models import AccessCode, Institution, KeyMapping, Relation, Subject, User
from ..security import create_token, current_user, hash_password, verify_password
from ..timeutil import utcnow

router = APIRouter(prefix="/api/auth", tags=["auth"])

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
STAFF_ROLES = ("guru", "bk", "admin", "pimpinan", "komite")
LEVELS = ("sd", "smp", "sma", "kampus")


class LoginIn(BaseModel):
    email: str
    password: str


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
    """`email` boleh berisi email atau nomor induk (siswa SD sering belum punya email)."""
    ident = body.email.strip()
    if "@" in ident:
        u = db.scalar(select(User).where(User.email == ident.lower()))
    else:
        u = db.scalar(select(User).where(User.nis == ident.upper(), User.role == "siswa"))
    if u is None or not verify_password(body.password, u.password_hash):
        raise HTTPException(401, "Email/nomor induk atau kata sandi tidak cocok")
    if u.pending_approval:
        raise HTTPException(403, "Akun Anda masih menunggu persetujuan admin sekolah.")
    if not u.active:
        raise HTTPException(403, "Akun ini dinonaktifkan. Hubungi admin sekolah.")
    return _session(db, u)


class RegisterIn(BaseModel):
    role: str
    name: str
    email: str
    password: str
    title: str | None = None  # sapaan staf, misalnya "Bu Rina"
    # siswa
    nis: str | None = None
    level: str | None = None
    class_name: str | None = None
    birth_date: date | None = None
    # wali
    child_nis: str | None = None


def _ui_mode(level: str) -> str:
    return {"sd": "anak", "kampus": "kampus"}.get(level, "remaja")


@router.post("/register", status_code=201)
def register(body: RegisterIn, db: Session = Depends(get_db)):
    role = body.role
    if role not in ("siswa", "wali", *STAFF_ROLES):
        raise HTTPException(422, "Peran tidak dikenal")
    name = " ".join(body.name.split())
    email = body.email.strip().lower()
    if len(name) < 3:
        raise HTTPException(422, "Nama lengkap minimal 3 huruf")
    if not EMAIL_RE.match(email):
        raise HTTPException(422, "Format email tidak valid")
    if len(body.password) < 8:
        raise HTTPException(422, "Kata sandi minimal 8 karakter")
    if db.scalar(select(User.id).where(User.email == email)):
        raise HTTPException(409, "Email ini sudah terdaftar. Silakan masuk.")
    inst = db.scalar(select(Institution).order_by(Institution.id))
    if inst is None:
        raise HTTPException(500, "Institusi belum disiapkan")

    nickname = name.split(" ")[0]
    u = User(
        email=email,
        password_hash=hash_password(body.password),
        name=name,
        nickname=nickname,
        role=role,
        institution_id=inst.id,
        title=(body.title or "").strip() or (None if role in ("siswa",) else nickname),
    )

    if role == "siswa":
        nis = (body.nis or "").strip().upper()
        if not re.fullmatch(r"[A-Z0-9\-]{3,30}", nis):
            raise HTTPException(422, "Nomor induk 3–30 karakter: huruf, angka, atau tanda hubung")
        if db.scalar(select(User.id).where(User.nis == nis)):
            raise HTTPException(409, "Nomor induk ini sudah terdaftar")
        if body.level not in LEVELS:
            raise HTTPException(422, "Pilih jenjang: SD, SMP, SMA, atau kampus")
        if not (body.class_name or "").strip():
            raise HTTPException(422, "Isi kelas atau program studi")
        if body.birth_date is None:
            raise HTTPException(422, "Isi tanggal lahir")
        a = age_on(body.birth_date)
        if a is None or a < 5 or a > 80 or body.birth_date > date.today():
            raise HTTPException(422, "Tanggal lahir tidak masuk akal")
        u.nis, u.level, u.class_name = nis, body.level, body.class_name.strip()
        u.birth_date, u.ui_mode = body.birth_date, _ui_mode(body.level)

    child = None
    if role == "wali":
        child = db.scalar(select(User).where(User.nis == (body.child_nis or "").strip().upper(), User.role == "siswa"))
        if child is None:
            raise HTTPException(422, "Nomor induk anak tidak ditemukan. Pastikan anak sudah terdaftar.")

    if role in STAFF_ROLES:
        u.pending_approval = True

    db.add(u)
    db.flush()

    if role == "siswa":
        while True:
            code = "S-" + secrets.token_hex(2).upper()
            if not db.scalar(select(Subject.id).where(Subject.code == code)):
                break
        s = Subject(code=code, class_name=u.class_name, level=u.level)
        db.add(s)
        db.flush()
        db.add(KeyMapping(user_id=u.id, subject_id=s.id))
    if child is not None:
        db.add(Relation(actor_id=u.id, student_id=child.id, kind="wali", status="menunggu_verifikasi"))

    audit.write(db, u, "daftar_akun", "pengguna", u.id, role, commit=False)
    db.commit()

    if u.pending_approval:
        return {"pending": True, "message": "Pendaftaran terkirim. Admin sekolah perlu menyetujui akun Anda sebelum bisa masuk."}
    return {"pending": False, **_session(db, u)}


# ── Kode dari sekolah ───────────────────────────────────────────────────────


@router.get("/code-info")
def code_info(code: str, db: Session = Depends(get_db)):
    """Pratinjau kode sebelum dipakai: hanya nama panggilan dan kelas, tanpa data lain."""
    ac = db.scalar(select(AccessCode).where(AccessCode.code == codes.normalize(code)))
    st = codes.status_of(ac)
    if ac is None or st != "aktif":
        return {"valid": False, "status": st}
    s = db.get(User, ac.student_id)
    return {"valid": True, "kind": ac.kind, "student": {"nickname": s.nickname, "class_name": s.class_name}}


class ActivateIn(BaseModel):
    nis: str
    code: str
    password: str
    email: str | None = None


@router.post("/activate")
def activate(body: ActivateIn, db: Session = Depends(get_db)):
    """Siswa mengaktifkan akun yang sudah dibuat sekolah. Juga dipakai bila lupa kata sandi."""
    student = db.scalar(select(User).where(User.nis == body.nis.strip().upper(), User.role == "siswa"))
    ac = codes.redeem(db, body.code, "aktivasi")
    if student is None or ac.student_id != student.id:
        raise HTTPException(422, "Nomor induk dan kode tidak cocok. Periksa kartu dari wali kelas.")
    if len(body.password) < 8:
        raise HTTPException(422, "Kata sandi minimal 8 karakter")
    if body.email and body.email.strip():
        email = body.email.strip().lower()
        if not EMAIL_RE.match(email):
            raise HTTPException(422, "Format email tidak valid")
        other = db.scalar(select(User).where(User.email == email, User.id != student.id))
        if other:
            raise HTTPException(409, "Email ini sudah dipakai akun lain")
        student.email = email
    student.password_hash = hash_password(body.password)
    student.active = True
    ac.used_at, ac.used_by = utcnow(), student.id
    audit.write(db, student, "aktivasi_akun", "pengguna", student.id, commit=False)
    db.commit()
    return _session(db, student)


class InviteIn(BaseModel):
    code: str
    name: str
    email: str
    password: str


def link_guardian(db: Session, guardian: User, ac: AccessCode) -> User:
    child = db.get(User, ac.student_id)
    existing = db.scalar(select(Relation).where(Relation.actor_id == guardian.id, Relation.student_id == child.id, Relation.kind == "wali"))
    if existing:
        existing.status, existing.approved_by = "aktif", ac.created_by
    else:
        db.add(Relation(actor_id=guardian.id, student_id=child.id, kind="wali", status="aktif", proposed_by=ac.created_by, approved_by=ac.created_by))
    ac.used_at, ac.used_by = utcnow(), guardian.id
    audit.write(db, guardian, "terima_undangan_wali", "siswa", child.id, "Terhubung lewat kode sekolah", commit=False)
    return child


@router.post("/accept-invite", status_code=201)
def accept_invite(body: InviteIn, db: Session = Depends(get_db)):
    """Orang tua membuat akun dari kode undangan sekolah; langsung terhubung ke anaknya."""
    ac = codes.redeem(db, body.code, "undangan_wali")
    name = " ".join(body.name.split())
    email = body.email.strip().lower()
    if len(name) < 3:
        raise HTTPException(422, "Nama lengkap minimal 3 huruf")
    if not EMAIL_RE.match(email):
        raise HTTPException(422, "Format email tidak valid")
    if len(body.password) < 8:
        raise HTTPException(422, "Kata sandi minimal 8 karakter")
    if db.scalar(select(User.id).where(User.email == email)):
        raise HTTPException(409, "Email ini sudah punya akun. Masuk dulu, lalu tambahkan anak dengan kode ini di halaman Ringkasan.")
    inst = db.scalar(select(Institution).order_by(Institution.id))
    g = User(email=email, password_hash=hash_password(body.password), name=name, nickname=name.split(" ")[0], title=name.split(" ")[0], role="wali", institution_id=inst.id)
    db.add(g)
    db.flush()
    link_guardian(db, g, ac)
    db.commit()
    return _session(db, g)


@router.get("/me")
def me(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return user_json(db, user)
