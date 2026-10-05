"""Model data Ri'ayah (PRD Bab 10.1).

Identitas (User) dipisahkan dari data analitik (Subject). Satu-satunya jembatan adalah
KeyMapping, yang di produksi disimpan di KMS/HSM. Jawaban check-in dan catatan konseling
disimpan terenkripsi.
"""
from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base
from .timeutil import utcnow

# Peran (kode PRD Bab 3.1)
ROLES = ("siswa", "wali", "guru", "bk", "admin", "pimpinan", "komite")

DATA_TYPES = ("kehadiran", "lms", "tugas", "kuis", "checkin", "bk_baca_checkin")
INDICATORS = ("kehadiran", "lms", "tugas", "kuis")


class Institution(Base):
    __tablename__ = "institution"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    kind: Mapped[str] = mapped_column(String(20))  # sekolah | kampus


class User(Base):
    __tablename__ = "user"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(200))
    name: Mapped[str] = mapped_column(String(200))
    nickname: Mapped[str] = mapped_column(String(80))
    role: Mapped[str] = mapped_column(String(20), index=True)
    title: Mapped[str | None] = mapped_column(String(80))  # sapaan staf: "Bu Sari"
    institution_id: Mapped[int] = mapped_column(ForeignKey("institution.id"))
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    # Akun staf hasil pendaftaran mandiri menunggu persetujuan admin sebelum bisa masuk.
    pending_approval: Mapped[bool] = mapped_column(Boolean, default=False)
    is_coordinator: Mapped[bool] = mapped_column(Boolean, default=False)
    # khusus siswa
    nis: Mapped[str | None] = mapped_column(String(30), unique=True)
    level: Mapped[str | None] = mapped_column(String(20))  # sd | smp | sma | kampus
    class_name: Mapped[str | None] = mapped_column(String(40))
    birth_date: Mapped[date | None] = mapped_column(Date)
    ui_mode: Mapped[str | None] = mapped_column(String(20))  # anak | remaja | kampus
    high_contrast: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Relation(Base):
    """Siapa boleh melihat siapa (F18). Perubahan dicatat di log audit."""

    __tablename__ = "relation"
    id: Mapped[int] = mapped_column(primary_key=True)
    actor_id: Mapped[int] = mapped_column(ForeignKey("user.id"), index=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("user.id"), index=True)
    kind: Mapped[str] = mapped_column(String(20))  # wali_kelas | dosen_pa | bk | wali
    status: Mapped[str] = mapped_column(String(30), default="aktif")  # aktif | menunggu_verifikasi | menunggu_persetujuan | nonaktif
    proposed_by: Mapped[int | None] = mapped_column(ForeignKey("user.id"))
    approved_by: Mapped[int | None] = mapped_column(ForeignKey("user.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Subject(Base):
    """Subjek analitik berpseudonim. Tidak memuat nama."""

    __tablename__ = "subject"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(12), unique=True)
    class_name: Mapped[str] = mapped_column(String(40))
    level: Mapped[str] = mapped_column(String(20))


class KeyMapping(Base):
    """Kunci pemetaan identitas ↔ subjek. Produksi: KMS/HSM, bukan tabel biasa."""

    __tablename__ = "key_mapping"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("user.id"), unique=True)
    subject_id: Mapped[int] = mapped_column(ForeignKey("subject.id"), unique=True)


class AuditAttribute(Base):
    """Atribut demografi hanya untuk audit keadilan (F12), tidak pernah menjadi fitur aturan."""

    __tablename__ = "audit_attribute"
    id: Mapped[int] = mapped_column(primary_key=True)
    subject_id: Mapped[int] = mapped_column(ForeignKey("subject.id"), unique=True)
    gender: Mapped[str] = mapped_column(String(10))
    area: Mapped[str] = mapped_column(String(20))  # kota | pinggiran


class Consent(Base):
    """Riwayat persetujuan per tujuan. Status berlaku = baris terbaru per (siswa, jenis, macam)."""

    __tablename__ = "consent"
    id: Mapped[int] = mapped_column(primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("user.id"), index=True)
    data_type: Mapped[str] = mapped_column(String(30))
    kind: Mapped[str] = mapped_column(String(20), default="persetujuan")  # persetujuan | asen
    granted: Mapped[bool] = mapped_column(Boolean)
    actor_id: Mapped[int] = mapped_column(ForeignKey("user.id"))
    period: Mapped[str] = mapped_column(String(60), default="Semester Ganjil 2026/2027")
    at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class WeeklyIndicator(Base):
    __tablename__ = "weekly_indicator"
    __table_args__ = (UniqueConstraint("subject_id", "week"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    subject_id: Mapped[int] = mapped_column(ForeignKey("subject.id"), index=True)
    week: Mapped[int] = mapped_column(Integer)
    week_start: Mapped[date] = mapped_column(Date)
    kehadiran: Mapped[int] = mapped_column(Integer)  # hari hadir 0..5
    lms: Mapped[int] = mapped_column(Integer)  # jumlah buka materi
    tugas: Mapped[int] = mapped_column(Integer)  # tugas terlambat
    kuis: Mapped[float] = mapped_column(Float)  # rata-rata nilai kuis 0..100


class CheckinResponse(Base):
    __tablename__ = "checkin_response"
    id: Mapped[int] = mapped_column(primary_key=True)
    subject_id: Mapped[int] = mapped_column(ForeignKey("subject.id"), index=True)
    week: Mapped[int] = mapped_column(Integer)
    answers_enc: Mapped[str] = mapped_column(Text)
    score_enc: Mapped[str] = mapped_column(Text)
    safety: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Feeling(Base):
    """Pilihan wajah mode anak. Tidak diberi skor dan tidak ditampilkan balik ke anak."""

    __tablename__ = "feeling"
    id: Mapped[int] = mapped_column(primary_key=True)
    subject_id: Mapped[int] = mapped_column(ForeignKey("subject.id"), index=True)
    feeling: Mapped[str] = mapped_column(String(20))
    at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Flag(Base):
    __tablename__ = "flag"
    id: Mapped[int] = mapped_column(primary_key=True)
    subject_id: Mapped[int] = mapped_column(ForeignKey("subject.id"), index=True)
    week: Mapped[int] = mapped_column(Integer)
    zone: Mapped[str] = mapped_column(String(10))  # kuning | merah
    rule_id: Mapped[str] = mapped_column(String(10))
    rule_version: Mapped[int] = mapped_column(Integer)
    counterfactual: Mapped[dict | None] = mapped_column(JSON)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    released_at: Mapped[datetime | None] = mapped_column(DateTime)
    reasons: Mapped[list["Reason"]] = relationship(order_by="Reason.rank", cascade="all, delete-orphan")


class Reason(Base):
    __tablename__ = "reason"
    id: Mapped[int] = mapped_column(primary_key=True)
    flag_id: Mapped[int] = mapped_column(ForeignKey("flag.id"), index=True)
    rank: Mapped[int] = mapped_column(Integer)
    indicator: Mapped[str] = mapped_column(String(20))
    text: Mapped[str] = mapped_column(Text)
    detail: Mapped[str] = mapped_column(Text)
    series: Mapped[list | None] = mapped_column(JSON)
    trigger_from: Mapped[int | None] = mapped_column(Integer)


class Case(Base):
    __tablename__ = "case"
    id: Mapped[int] = mapped_column(primary_key=True)
    flag_id: Mapped[int | None] = mapped_column(ForeignKey("flag.id"))
    subject_id: Mapped[int] = mapped_column(ForeignKey("subject.id"), index=True)
    zone: Mapped[str] = mapped_column(String(10))
    rule_id: Mapped[str] = mapped_column(String(10))
    status: Mapped[str] = mapped_column(String(20), default="baru")
    # baru | disapa | ditindaklanjuti | ditutup | terlambat | ditinjau
    owner_id: Mapped[int | None] = mapped_column(ForeignKey("user.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    due_at: Mapped[datetime] = mapped_column(DateTime)
    student_response: Mapped[str | None] = mapped_column(String(20))  # mau | belum_mau | tidak_sesuai
    first_contact_at: Mapped[datetime | None] = mapped_column(DateTime)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime)
    closed_reason: Mapped[str | None] = mapped_column(Text)
    review_at: Mapped[date | None] = mapped_column(Date)


class FollowUp(Base):
    """Tindak lanjut hanya memuat kode hasil, tidak memuat isi cerita."""

    __tablename__ = "follow_up"
    id: Mapped[int] = mapped_column(primary_key=True)
    case_id: Mapped[int] = mapped_column(ForeignKey("case.id"), index=True)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("user.id"))
    action: Mapped[str] = mapped_column(String(40))
    outcome: Mapped[str | None] = mapped_column(String(60))
    at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class CounselingNote(Base):
    __tablename__ = "counseling_note"
    id: Mapped[int] = mapped_column(primary_key=True)
    case_id: Mapped[int] = mapped_column(ForeignKey("case.id"), index=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("user.id"))
    content_enc: Mapped[str] = mapped_column(Text)
    label: Mapped[str | None] = mapped_column(String(40))
    at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Objection(Base):
    __tablename__ = "objection"
    id: Mapped[int] = mapped_column(primary_key=True)
    case_id: Mapped[int] = mapped_column(ForeignKey("case.id"), index=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("user.id"))
    statement: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="menunggu")  # menunggu | diputus
    decision: Mapped[str | None] = mapped_column(String(30))  # cabut | pertahankan | tinjau_aturan
    reason: Mapped[str | None] = mapped_column(Text)
    reviewer_id: Mapped[int | None] = mapped_column(ForeignKey("user.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    due_at: Mapped[datetime] = mapped_column(DateTime)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime)


class DataRequest(Base):
    __tablename__ = "data_request"
    id: Mapped[int] = mapped_column(primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("user.id"), index=True)
    requester_id: Mapped[int] = mapped_column(ForeignKey("user.id"))
    kind: Mapped[str] = mapped_column(String(20))  # lihat | unduh | perbaiki | hapus | tarik
    status: Mapped[str] = mapped_column(String(20), default="diajukan")  # diajukan | diproses | selesai | ditolak
    detail: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    due_at: Mapped[datetime] = mapped_column(DateTime)
    done_at: Mapped[datetime | None] = mapped_column(DateTime)


class RuleVersion(Base):
    __tablename__ = "rule_version"
    id: Mapped[int] = mapped_column(primary_key=True)
    rule_id: Mapped[str] = mapped_column(String(10), index=True)
    version: Mapped[int] = mapped_column(Integer)
    params: Mapped[dict] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(20))  # draf | diajukan | aktif | ditolak | arsip
    reason: Mapped[str | None] = mapped_column(Text)
    owner: Mapped[str | None] = mapped_column(String(80))
    proposed_by: Mapped[int | None] = mapped_column(ForeignKey("user.id"))
    approved_by: Mapped[int | None] = mapped_column(ForeignKey("user.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime)


class XaiTest(Base):
    __tablename__ = "xai_test"
    id: Mapped[int] = mapped_column(primary_key=True)
    test: Mapped[str] = mapped_column(String(30))
    value: Mapped[float] = mapped_column(Float)
    target: Mapped[float] = mapped_column(Float)
    passed: Mapped[bool] = mapped_column(Boolean)
    simulated: Mapped[bool] = mapped_column(Boolean, default=False)
    detail: Mapped[str | None] = mapped_column(Text)
    run_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class AuditLog(Base):
    """Log tambah-saja dengan hash berantai (F9)."""

    __tablename__ = "audit_log"
    id: Mapped[int] = mapped_column(primary_key=True)
    at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    actor_id: Mapped[int | None] = mapped_column(Integer)
    actor_label: Mapped[str] = mapped_column(String(120))
    actor_role: Mapped[str] = mapped_column(String(20))
    action: Mapped[str] = mapped_column(String(60))
    object_type: Mapped[str] = mapped_column(String(40))
    object_id: Mapped[str | None] = mapped_column(String(40))
    detail: Mapped[str | None] = mapped_column(Text)
    technical: Mapped[bool] = mapped_column(Boolean, default=False)
    prev_hash: Mapped[str] = mapped_column(String(64))
    hash: Mapped[str] = mapped_column(String(64))


class EmergencyContact(Base):
    __tablename__ = "emergency_contact"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    kind: Mapped[str] = mapped_column(String(30))  # bk | krisis | kesehatan | keamanan
    phone: Mapped[str | None] = mapped_column(String(40))
    hours: Mapped[str | None] = mapped_column(String(80))
    verified: Mapped[bool] = mapped_column(Boolean, default=False)
    note: Mapped[str | None] = mapped_column(Text)


class LibraryItem(Base):
    __tablename__ = "library_item"
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    kind: Mapped[str] = mapped_column(String(20))  # bacaan | latihan | audio | info
    category: Mapped[str] = mapped_column(String(40))
    source: Mapped[str] = mapped_column(String(200))
    label: Mapped[str] = mapped_column(String(30))  # Mandiri | Info layanan
    status: Mapped[str] = mapped_column(String(20), default="draf")  # draf | terbit
    minutes: Mapped[int] = mapped_column(Integer, default=3)
    summary: Mapped[str] = mapped_column(Text)
    body: Mapped[str] = mapped_column(Text)
    reviewed_by: Mapped[str | None] = mapped_column(String(120))


class ServiceHours(Base):
    __tablename__ = "service_hours"
    id: Mapped[int] = mapped_column(primary_key=True)
    weekday: Mapped[int] = mapped_column(Integer)  # 0 = Senin
    open_time: Mapped[str | None] = mapped_column(String(5))
    close_time: Mapped[str | None] = mapped_column(String(5))


class Invitation(Base):
    __tablename__ = "invitation"
    id: Mapped[int] = mapped_column(primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("user.id"))
    guardian_id: Mapped[int] = mapped_column(ForeignKey("user.id"))
    counselor_id: Mapped[int] = mapped_column(ForeignKey("user.id"))
    message: Mapped[str] = mapped_column(Text)
    slots: Mapped[list] = mapped_column(JSON)
    chosen: Mapped[str | None] = mapped_column(String(40))
    status: Mapped[str] = mapped_column(String(20), default="menunggu")  # menunggu | dikonfirmasi | minta_ulang
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class ImportJob(Base):
    __tablename__ = "import_job"
    id: Mapped[int] = mapped_column(primary_key=True)
    filename: Mapped[str] = mapped_column(String(200))
    by_id: Mapped[int] = mapped_column(ForeignKey("user.id"))
    rows_total: Mapped[int] = mapped_column(Integer)
    rows_ok: Mapped[int] = mapped_column(Integer)
    rows_bad: Mapped[int] = mapped_column(Integer)
    kept_columns: Mapped[list] = mapped_column(JSON)
    dropped_columns: Mapped[list] = mapped_column(JSON)
    errors: Mapped[list] = mapped_column(JSON)
    at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Setting(Base):
    __tablename__ = "setting"
    key: Mapped[str] = mapped_column(String(60), primary_key=True)
    value: Mapped[dict] = mapped_column(JSON)
