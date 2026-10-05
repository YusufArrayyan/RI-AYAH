"""Pemeriksaan akses di sisi server (aturan wajib 14.3.3) dan status persetujuan.

Setiap query data siswa melewati fungsi di modul ini. Menyembunyikan tombol di antarmuka
tidak pernah dianggap sebagai kontrol akses.
"""
from __future__ import annotations

from datetime import date

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import DATA_TYPES, Case, Consent, KeyMapping, Relation, Subject, User

# Matriks akses Bab 3.2 dalam bentuk data. Dipakai oleh tes peran dan oleh endpoint.
ACCESS_MATRIX: dict[str, dict[str, str]] = {
    "zona_alasan": {"siswa": "miliknya", "wali": "tidak", "guru": "kuning_saja", "bk": "ya", "admin": "tidak", "pimpinan": "tidak", "komite": "per_kasus"},
    "jawaban_checkin": {"siswa": "miliknya", "wali": "tidak", "guru": "tidak", "bk": "bila_setuju", "admin": "tidak", "pimpinan": "tidak", "komite": "tidak"},
    "catatan_konseling": {"siswa": "tidak", "wali": "tidak", "guru": "tidak", "bk": "miliknya", "admin": "tidak", "pimpinan": "tidak", "komite": "per_kasus"},
    "indikator_mingguan": {"siswa": "miliknya", "wali": "ya_anak", "guru": "per_kasus", "bk": "per_kasus", "admin": "teknis", "pimpinan": "tidak", "komite": "ya"},
    "log_akses_sendiri": {"siswa": "ya", "wali": "ya_anak", "guru": "tidak", "bk": "tidak", "admin": "tidak", "pimpinan": "tidak", "komite": "ya"},
    "log_audit_sistem": {"siswa": "tidak", "wali": "tidak", "guru": "tidak", "bk": "tidak", "admin": "teknis", "pimpinan": "tidak", "komite": "ya"},
    "agregat": {"siswa": "tidak", "wali": "tidak", "guru": "tidak", "bk": "beban", "admin": "tidak", "pimpinan": "ya", "komite": "ya"},
    "aturan_ambang": {"siswa": "tidak", "wali": "tidak", "guru": "tidak", "bk": "lihat", "admin": "draf", "pimpinan": "tidak", "komite": "setujui"},
    "kontak_pustaka": {"siswa": "lihat", "wali": "lihat", "guru": "lihat", "bk": "lihat", "admin": "ubah", "pimpinan": "tidak", "komite": "tidak"},
}

AGGREGATE_MIN = 10  # k ≥ 10


def forbid(msg: str = "Anda tidak memiliki akses ke data ini") -> HTTPException:
    return HTTPException(status.HTTP_403_FORBIDDEN, msg)


def subject_for(db: Session, user: User) -> Subject | None:
    km = db.scalar(select(KeyMapping).where(KeyMapping.user_id == user.id))
    return db.get(Subject, km.subject_id) if km else None


def user_for_subject(db: Session, subject_id: int) -> User | None:
    km = db.scalar(select(KeyMapping).where(KeyMapping.subject_id == subject_id))
    return db.get(User, km.user_id) if km else None


def related_student_ids(db: Session, actor: User, kinds: tuple[str, ...]) -> set[int]:
    rows = db.scalars(
        select(Relation.student_id).where(
            Relation.actor_id == actor.id, Relation.kind.in_(kinds), Relation.status == "aktif"
        )
    )
    return set(rows)


def related_subject_ids(db: Session, actor: User, kinds: tuple[str, ...]) -> set[int]:
    sids = related_student_ids(db, actor, kinds)
    if not sids:
        return set()
    return set(db.scalars(select(KeyMapping.subject_id).where(KeyMapping.user_id.in_(sids))))


def require_guardian_of(db: Session, guardian: User, student_id: int) -> User:
    if student_id not in related_student_ids(db, guardian, ("wali",)):
        raise forbid("Anda bukan wali terdaftar untuk siswa ini")
    student = db.get(User, student_id)
    if student is None:
        raise HTTPException(404, "Siswa tidak ditemukan")
    return student


def require_teacher_case(db: Session, teacher: User, case: Case) -> None:
    """Guru hanya melihat kasus kuning siswa kelas binaannya (F6, F18)."""
    if case.zone != "kuning":
        raise forbid("Kasus merah hanya ditangani guru BK")
    if case.subject_id not in related_subject_ids(db, teacher, ("wali_kelas", "dosen_pa")):
        raise forbid("Siswa ini bukan siswa binaan Anda")


def require_counselor_case(db: Session, counselor: User, case: Case) -> None:
    """BK hanya membuka kasus yang ditugaskan kepadanya; koordinator boleh semua (F18)."""
    if counselor.is_coordinator:
        return
    if case.owner_id != counselor.id:
        raise forbid("Kasus ini belum ditugaskan kepada Anda. Ambil kasus dari antrean dulu.")


# ── Persetujuan ─────────────────────────────────────────────────────────────


def consent_state(db: Session, student_id: int) -> dict[str, dict]:
    """Status terbaru per jenis data dan macam (persetujuan/asen)."""
    rows = db.scalars(
        select(Consent).where(Consent.student_id == student_id).order_by(Consent.at, Consent.id)
    ).all()
    state: dict[str, dict] = {
        dt: {"persetujuan": None, "asen": None, "since": None} for dt in DATA_TYPES
    }
    for r in rows:
        s = state.setdefault(r.data_type, {"persetujuan": None, "asen": None, "since": None})
        s[r.kind] = r.granted
        if r.kind == "persetujuan":
            s["since"] = r.at if r.granted else None
            s["by"] = r.actor_id
    return state


def age_on(birth: date | None, today: date | None = None) -> int | None:
    if birth is None:
        return None
    t = today or date.today()
    return t.year - birth.year - ((t.month, t.day) < (birth.month, birth.day))


def needs_guardian(student: User) -> bool:
    """Siswa sekolah di bawah 18 tahun memerlukan persetujuan wali (UU PDP Pasal 25 ayat 2)."""
    a = age_on(student.birth_date)
    return student.level in ("sd", "smp", "sma") and (a is None or a < 18)


def needs_reconfirm(db: Session, student: User) -> bool:
    """F21: usia 18 dan persetujuan berasal dari wali → sistem meminta persetujuan baru."""
    if student.level not in ("sd", "smp", "sma"):
        return False
    a = age_on(student.birth_date)
    if a is None or a < 18:
        return False
    rows = db.scalars(
        select(Consent).where(
            Consent.student_id == student.id, Consent.kind == "persetujuan", Consent.granted.is_(True)
        )
    ).all()
    own = [r for r in rows if r.actor_id == student.id]
    return bool(rows) and not own


def processing_allowed(db: Session, student: User, data_type: str) -> bool:
    """Data hanya diproses bila persetujuan berlaku. Untuk anak: wali + asen anak (F16)."""
    st = consent_state(db, student.id).get(data_type, {})
    if needs_reconfirm(db, student):
        return False
    if needs_guardian(student):
        return bool(st.get("persetujuan")) and bool(st.get("asen"))
    return bool(st.get("persetujuan"))


def any_processing(db: Session, student: User) -> bool:
    return any(processing_allowed(db, student, dt) for dt in ("kehadiran", "lms", "tugas", "kuis", "checkin"))
