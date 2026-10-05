"""Kode aktivasi siswa dan kode undangan orang tua."""
from __future__ import annotations

import secrets
from datetime import timedelta

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import AccessCode, User
from .timeutil import utcnow

# Tanpa huruf/angka yang mudah tertukar (0/O, 1/I/L), agar mudah diketik anak.
ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
VALID_DAYS = 30


def new_code(db: Session) -> str:
    while True:
        raw = "".join(secrets.choice(ALPHABET) for _ in range(8))
        code = f"{raw[:4]}-{raw[4:]}"
        if not db.scalar(select(AccessCode.id).where(AccessCode.code == code)):
            return code


def normalize(code: str) -> str:
    c = "".join(ch for ch in code.upper() if ch.isalnum())
    return f"{c[:4]}-{c[4:]}" if len(c) == 8 else code.strip().upper()


def issue(db: Session, *, student: User, kind: str, by: User) -> AccessCode:
    """Buat kode baru; kode lama yang belum dipakai untuk siswa dan jenis yang sama dicabut."""
    for old in db.scalars(
        select(AccessCode).where(
            AccessCode.student_id == student.id, AccessCode.kind == kind, AccessCode.used_at.is_(None), AccessCode.revoked.is_(False)
        )
    ):
        old.revoked = True
    now = utcnow()
    ac = AccessCode(code=new_code(db), kind=kind, student_id=student.id, created_by=by.id, created_at=now, expires_at=now + timedelta(days=VALID_DAYS))
    db.add(ac)
    db.flush()
    return ac


def redeem(db: Session, code: str, kind: str) -> AccessCode:
    ac = db.scalar(select(AccessCode).where(AccessCode.code == normalize(code), AccessCode.kind == kind))
    if ac is None or ac.revoked:
        raise HTTPException(422, "Kode tidak dikenal. Periksa lagi huruf dan angkanya, atau minta kode baru ke sekolah.")
    if ac.used_at is not None:
        raise HTTPException(409, "Kode ini sudah pernah dipakai. Bila itu bukan Anda, hubungi sekolah.")
    if ac.expires_at < utcnow():
        raise HTTPException(410, "Kode sudah kedaluwarsa. Minta kode baru ke wali kelas atau admin sekolah.")
    return ac


def status_of(ac: AccessCode | None) -> str:
    if ac is None:
        return "belum_ada"
    if ac.used_at:
        return "terpakai"
    if ac.revoked:
        return "dicabut"
    if ac.expires_at < utcnow():
        return "kedaluwarsa"
    return "aktif"
