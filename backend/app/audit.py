"""Log audit tambah-saja dengan hash berantai (F9, aturan wajib 14.3.4)."""
from __future__ import annotations

import hashlib
import json

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import AuditLog, User
from .timeutil import utcnow

GENESIS = "0" * 64


def _digest(prev_hash: str, entry: dict) -> str:
    canonical = json.dumps(entry, sort_keys=True, ensure_ascii=False, default=str)
    return hashlib.sha256((prev_hash + canonical).encode()).hexdigest()


def _entry_dict(e: AuditLog) -> dict:
    return {
        "at": e.at.isoformat(timespec="seconds"),
        "actor_id": e.actor_id,
        "actor_role": e.actor_role,
        "action": e.action,
        "object_type": e.object_type,
        "object_id": e.object_id,
        "detail": e.detail,
    }


def write(
    db: Session,
    actor: User | None,
    action: str,
    object_type: str,
    object_id: str | int | None = None,
    detail: str | None = None,
    technical: bool = False,
    commit: bool = True,
    at=None,
) -> AuditLog:
    """Tulis entri audit. Dipanggil SEBELUM data sensitif dikirim ke klien."""
    last = db.scalars(select(AuditLog).order_by(AuditLog.id.desc()).limit(1)).first()
    prev = last.hash if last else GENESIS
    entry = AuditLog(
        at=(at or utcnow()).replace(microsecond=0),
        actor_id=actor.id if actor else None,
        actor_label=(actor.title or actor.name) if actor else "Sistem",
        actor_role=actor.role if actor else "sistem",
        action=action,
        object_type=object_type,
        object_id=str(object_id) if object_id is not None else None,
        detail=detail,
        technical=technical,
        prev_hash=prev,
        hash="",
    )
    entry.hash = _digest(prev, _entry_dict(entry))
    db.add(entry)
    if commit:
        db.commit()
    else:
        db.flush()
    return entry


def verify_chain(db: Session) -> dict:
    """Hitung ulang seluruh rantai. Mengembalikan id entri pertama yang rusak bila ada."""
    prev = GENESIS
    broken: list[int] = []
    count = 0
    for e in db.scalars(select(AuditLog).order_by(AuditLog.id)):
        count += 1
        expected = _digest(prev, _entry_dict(e))
        if e.prev_hash != prev or e.hash != expected:
            broken.append(e.id)
        prev = e.hash
    return {"ok": not broken, "checked": count, "broken_ids": broken[:50]}
