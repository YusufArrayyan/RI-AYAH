"""P1 Dasbor agregat. Tidak ada data individu, kode siswa, atau peringkat; kelompok minimal 10."""
from __future__ import annotations

from collections import defaultdict
from datetime import timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..access import AGGREGATE_MIN, any_processing
from ..analytics import median_or_none
from ..db import get_db
from ..models import Case, Subject, User
from ..security import require_role
from ..timeutil import utcnow

router = APIRouter(prefix="/api/leader", tags=["pimpinan"])
leader_only = require_role("pimpinan", "komite")

LEVEL_NAMES = {"sd": "SD", "smp": "SMP", "sma": "SMA", "kampus": "Kampus"}


@router.get("/dashboard")
def dashboard(weeks: int = 8, user: User = Depends(leader_only), db: Session = Depends(get_db)):
    weeks = max(4, min(weeks, 16))
    now = utcnow()
    since = now - timedelta(weeks=weeks)
    students = db.scalars(select(User).where(User.role == "siswa", User.active.is_(True))).all()
    subjects = {s.id: s for s in db.scalars(select(Subject))}
    cases = db.scalars(select(Case).where(Case.created_at >= since)).all()

    participating = [s for s in students if any_processing(db, s)]
    yellow = [c for c in cases if c.zone == "kuning"]
    timely = [c for c in yellow if c.first_contact_at and (c.first_contact_at - c.created_at) <= timedelta(days=7)]
    red_hours = [(c.first_contact_at - c.created_at).total_seconds() / 3600 for c in cases if c.zone == "merah" and c.first_contact_at]

    trend = []
    for i in range(weeks):
        start = since + timedelta(weeks=i)
        end = start + timedelta(weeks=1)
        n = sum(1 for c in cases if start <= c.created_at < end)
        trend.append({"label": f"P{i + 1}", "value": n})

    by_level: dict[str, dict] = defaultdict(lambda: {"students": 0, "participating": 0, "yellow": 0, "timely": 0})
    for s in students:
        lv = s.level or "-"
        by_level[lv]["students"] += 1
        if s in participating:
            by_level[lv]["participating"] += 1
    for c in yellow:
        lv = subjects[c.subject_id].level
        by_level[lv]["yellow"] += 1
        if c in timely:
            by_level[lv]["timely"] += 1
    levels = []
    for lv, d in sorted(by_level.items()):
        hidden = d["students"] < AGGREGATE_MIN
        levels.append(
            {
                "level": LEVEL_NAMES.get(lv, lv),
                "hidden": hidden,
                "participation": None if hidden else round(d["participating"] / d["students"], 2),
                "timely": None if hidden or not d["yellow"] else round(d["timely"] / d["yellow"], 2),
                "n": None if hidden else d["students"],
            }
        )
    enough = len(cases) >= 3
    return {
        "weeks": weeks,
        "enough_data": enough,
        "participation": round(len(participating) / len(students), 2) if students else None,
        "timely_rate": round(len(timely) / len(yellow), 2) if yellow else None,
        "red_median_hours": median_or_none(red_hours),
        "trend": trend,
        "levels": levels,
        "min_group": AGGREGATE_MIN,
        "actions": [
            "Jadwalkan pelatihan menyapa untuk wali kelas yang baru bergabung.",
            "Tinjau kapasitas BK bersama koordinator bila respons merah mendekati 24 jam.",
            "Bahas hasil audit keadilan semester ini dengan komite etik.",
        ],
    }
