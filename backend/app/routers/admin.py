"""Layar admin A1–A4. Admin menjalankan sistem dan tidak membaca isi check-in atau catatan."""
from __future__ import annotations

import csv
import io
import json
from datetime import date

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import audit, codes, rules
from ..access import subject_for
from ..analytics import estimate_load
from ..db import get_db
from ..models import (
    AccessCode,
    EmergencyContact,
    ImportJob,
    Institution,
    KeyMapping,
    LibraryItem,
    Relation,
    RuleVersion,
    ServiceHours,
    Setting,
    Subject,
    User,
    WeeklyIndicator,
)
from ..security import hash_password, require_role
from ..services import active_params, create_flag_and_case, evaluate_subject, get_setting, open_case_for
from ..timeutil import utcnow
from .common import DAYS, contact_json

router = APIRouter(prefix="/api/admin", tags=["admin"])
admin_only = require_role("admin")
approver = require_role("admin", "komite")

# ── A1 Impor data ───────────────────────────────────────────────────────────

FIELDS = {
    "nis": {"label": "Nomor induk siswa", "hint": "Dipseudonimkan saat masuk", "aliases": ("nis", "nim", "nisn", "no_induk")},
    "pekan": {"label": "Minggu ke-", "hint": "Bilangan bulat ≥ 1", "aliases": ("pekan", "minggu", "week")},
    "kehadiran": {"label": "Kehadiran (hari)", "hint": "0 sampai 5", "aliases": ("kehadiran", "hadir", "attendance")},
    "lms": {"label": "Buka materi online", "hint": "Jumlah, ≥ 0", "aliases": ("lms", "buka_materi", "akses_lms")},
    "tugas": {"label": "Tugas terlambat", "hint": "Jumlah, ≥ 0", "aliases": ("tugas", "tugas_terlambat", "late")},
    "kuis": {"label": "Nilai kuis", "hint": "0 sampai 100", "aliases": ("kuis", "nilai_kuis", "quiz")},
}

SAMPLE_CSV = """nis,nama,pekan,kehadiran,akses_lms,tugas_terlambat,nilai_kuis,agama,alamat
SIM-0001,Nadia Putri (SIMULASI),9,2,4,3,60,Islam,Jl. Contoh 1
SIM-0002,Dimas Pratama (SIMULASI),9,5,13,0,84,Islam,Jl. Contoh 2
SIM-0005,Siti Rahma (SIMULASI),9,4,9,1,77,Islam,Jl. Contoh 3
SIM-0006,Bagas Wibowo (SIMULASI),9,7,10,0,80,Kristen,Jl. Contoh 4
SIM-9999,Tidak Terdaftar (SIMULASI),9,5,10,0,80,Islam,Jl. Contoh 5
SIM-0007,Rani Kusuma (SIMULASI),pekan9,5,11,0,82,Islam,Jl. Contoh 6
"""


def _guess(header: str) -> str | None:
    h = header.strip().lower().replace(" ", "_")
    for key, meta in FIELDS.items():
        if h in meta["aliases"]:
            return key
    return None


def _read_csv(raw: bytes) -> tuple[list[str], list[dict]]:
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise HTTPException(422, "Berkas harus berformat CSV UTF-8") from exc
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise HTTPException(422, "Berkas tidak memiliki baris judul kolom")
    rows = list(reader)
    if len(rows) > 20000:
        raise HTTPException(413, "Terlalu banyak baris. Pecah berkas menjadi maksimal 20.000 baris.")
    return list(reader.fieldnames), rows


def _validate(db: Session, rows: list[dict], mapping: dict[str, str]) -> tuple[list[dict], list[dict]]:
    ok, bad = [], []
    nis_map = {u.nis: u for u in db.scalars(select(User).where(User.nis.is_not(None)))}
    for i, r in enumerate(rows, start=2):
        try:
            nis = r[mapping["nis"]].strip()
            user = nis_map.get(nis)
            if user is None:
                raise ValueError("Siswa tidak terdaftar")
            pekan = int(r[mapping["pekan"]])
            keh = int(r[mapping["kehadiran"]])
            lms = int(r[mapping["lms"]])
            tug = int(r[mapping["tugas"]])
            kuis = float(r[mapping["kuis"]])
            if pekan < 1:
                raise ValueError("Pekan harus ≥ 1")
            if not 0 <= keh <= 5:
                raise ValueError("Kehadiran harus 0 sampai 5")
            if lms < 0 or tug < 0:
                raise ValueError("Jumlah tidak boleh negatif")
            if not 0 <= kuis <= 100:
                raise ValueError("Nilai kuis harus 0 sampai 100")
            ok.append({"user": user, "pekan": pekan, "kehadiran": keh, "lms": lms, "tugas": tug, "kuis": kuis})
        except (KeyError, ValueError, TypeError) as exc:
            msg = str(exc) if isinstance(exc, ValueError) and not str(exc).startswith("invalid literal") else "Nilai bukan angka"
            if isinstance(exc, KeyError):
                msg = "Kolom wajib belum dipetakan"
            bad.append({"line": i, "error": msg})
    return ok, bad


def _analyze(db: Session, headers: list[str], rows: list[dict], mapping: dict[str, str] | None):
    mapping = mapping or {}
    if not mapping:
        for h in headers:
            g = _guess(h)
            if g and g not in mapping:
                mapping[g] = h
    kept = set(mapping.values())
    dropped = [h for h in headers if h not in kept]
    missing = [k for k in FIELDS if k not in mapping]
    ok, bad = _validate(db, rows, mapping) if not missing else ([], [])
    return mapping, dropped, missing, ok, bad


@router.get("/import/fields")
def import_fields(user: User = Depends(admin_only)):
    return {"fields": [{"key": k, **{kk: vv for kk, vv in v.items() if kk != "aliases"}} for k, v in FIELDS.items()]}


@router.get("/import/sample", response_class=PlainTextResponse)
def import_sample(user: User = Depends(admin_only)):
    return PlainTextResponse(SAMPLE_CSV, headers={"Content-Disposition": 'attachment; filename="contoh-impor-SIMULASI.csv"'})


@router.get("/import/template", response_class=PlainTextResponse)
def import_template(pattern: str = "memburuk", user: User = Depends(admin_only), db: Session = Depends(get_db)):
    """Templat CSV untuk siswa yang belum punya data mingguan (misalnya baru mendaftar).

    pola "memburuk": stabil 5 pekan lalu kehadiran dan buka materi turun 3 pekan
    (cukup untuk memicu K1). pola "stabil": tidak ada perubahan berarti. Semua SIMULASI.
    """
    if pattern not in ("memburuk", "stabil"):
        raise HTTPException(422, "Pola tidak dikenal")
    have = set(db.scalars(select(WeeklyIndicator.subject_id).distinct()))
    students = []
    for u in db.scalars(select(User).where(User.role == "siswa", User.nis.is_not(None)).order_by(User.id)):
        s = subject_for(db, u)
        if s is not None and s.id not in have:
            students.append(u)
    rows = ["nis,pekan,kehadiran,akses_lms,tugas_terlambat,nilai_kuis"]
    for u in students:
        for w in range(1, 9):
            if pattern == "memburuk" and w >= 6:
                k, lms, t = 5 - (w - 5), 12 - 3 * (w - 5), w - 5
            else:
                k, lms, t = 5, 12 + (w % 2), 0
            rows.append(f"{u.nis},{w},{k},{lms},{t},{80 + (w % 3)}")
    if len(rows) == 1:
        raise HTTPException(404, "Semua siswa sudah memiliki data mingguan. Daftarkan siswa baru dulu.")
    return PlainTextResponse("\n".join(rows) + "\n", headers={"Content-Disposition": f'attachment; filename="templat-{pattern}-SIMULASI.csv"'})


@router.post("/import/preview")
async def import_preview(
    file: UploadFile = File(...),
    mapping: str = Form(""),
    user: User = Depends(admin_only),
    db: Session = Depends(get_db),
):
    headers, rows = _read_csv(await file.read())
    m, dropped, missing, ok, bad = _analyze(db, headers, rows, json.loads(mapping) if mapping else None)
    return {
        "filename": file.filename,
        "headers": headers,
        "mapping": m,
        "dropped": dropped,
        "missing": missing,
        "rows_total": len(rows),
        "rows_ok": len(ok),
        "rows_bad": len(bad),
        "errors": bad[:50],
        "preview": [
            {"kode": subject_for(db, r["user"]).code if subject_for(db, r["user"]) else "-", **{k: r[k] for k in ("pekan", "kehadiran", "lms", "tugas", "kuis")}}
            for r in ok[:5]
        ],
    }


@router.post("/import/commit")
async def import_commit(
    file: UploadFile = File(...),
    mapping: str = Form(...),
    user: User = Depends(admin_only),
    db: Session = Depends(get_db),
):
    headers, rows = _read_csv(await file.read())
    m, dropped, missing, ok, bad = _analyze(db, headers, rows, json.loads(mapping))
    if missing:
        raise HTTPException(422, f"Kolom wajib belum dipetakan: {', '.join(missing)}")
    from datetime import date, timedelta

    new_cases = 0
    touched = set()
    for r in ok:
        s = subject_for(db, r["user"])
        if s is None:
            continue
        w = db.scalars(select(WeeklyIndicator).where(WeeklyIndicator.subject_id == s.id, WeeklyIndicator.week == r["pekan"])).first()
        if w is None:
            w = WeeklyIndicator(subject_id=s.id, week=r["pekan"], week_start=date(2026, 7, 13) + timedelta(weeks=r["pekan"] - 1), kehadiran=0, lms=0, tugas=0, kuis=0)
            db.add(w)
        w.kehadiran, w.lms, w.tugas, w.kuis = r["kehadiran"], r["lms"], r["tugas"], r["kuis"]
        touched.add((s, r["pekan"]))
    db.flush()
    for s, wk in touched:
        ev = evaluate_subject(db, s)
        if ev and ev.zone != "hijau" and open_case_for(db, s.id) is None:
            create_flag_and_case(db, s, ev, week=wk)
            new_cases += 1
    job = ImportJob(
        filename=file.filename or "impor.csv",
        by_id=user.id,
        rows_total=len(rows),
        rows_ok=len(ok),
        rows_bad=len(bad),
        kept_columns=list(m.values()),
        dropped_columns=dropped,
        errors=bad[:200],
    )
    db.add(job)
    audit.write(db, user, "impor_data", "impor", None, f"{len(ok)} baris masuk, {len(bad)} ditolak, {len(dropped)} kolom dibuang", commit=False)
    db.commit()
    return {"ok": True, "job_id": job.id, "rows_ok": len(ok), "rows_bad": len(bad), "dropped": dropped, "new_cases": new_cases}


@router.get("/imports")
def imports(user: User = Depends(admin_only), db: Session = Depends(get_db)):
    jobs = db.scalars(select(ImportJob).order_by(ImportJob.id.desc()).limit(10)).all()
    return [
        {"id": j.id, "filename": j.filename, "at": j.at.isoformat(), "rows_ok": j.rows_ok, "rows_bad": j.rows_bad, "dropped": j.dropped_columns}
        for j in jobs
    ]


# ── Reset data demo ─────────────────────────────────────────────────────────


@router.get("/demo-info")
def demo_info(user: User = Depends(admin_only)):
    from ..config import settings

    return {"resettable": not settings.is_production, "persistent": settings.is_persistent_db}


@router.post("/reset-demo")
def reset_demo(user: User = Depends(admin_only), db: Session = Depends(get_db)):
    """Kembalikan seluruh data ke SIMULASI awal. Tidak tersedia di produksi.

    Menghapus semua akun yang didaftarkan, kasus, log audit, dan perubahan aturan.
    """
    from ..config import settings
    from ..seed import reset_and_seed

    if settings.is_production:
        raise HTTPException(404)
    db.close()
    reset_and_seed()
    return {"ok": True}


# ── A2 Pengguna dan relasi ──────────────────────────────────────────────────

ROLE_NAMES = {"siswa": "Siswa", "wali": "Wali", "guru": "Guru", "bk": "Guru BK", "admin": "Admin", "pimpinan": "Pimpinan", "komite": "Komite"}


@router.get("/users")
def users(role: str = "", q: str = "", user: User = Depends(admin_only), db: Session = Depends(get_db)):
    stmt = select(User)
    if role:
        stmt = stmt.where(User.role == role)
    if q.strip():
        stmt = stmt.where(User.name.ilike(f"%{q.strip()}%"))
    rows = db.scalars(stmt.order_by(User.role, User.name).limit(200)).all()
    rels = db.scalars(select(Relation)).all()
    counts = {r: n for r, n in db.execute(select(User.role, func.count()).group_by(User.role))}
    pending_accounts = db.scalar(select(func.count()).select_from(User).where(User.pending_approval.is_(True)))
    out = []
    for u in rows:
        mine = [r for r in rels if r.actor_id == u.id or r.student_id == u.id]
        scope = u.class_name or ""
        if u.role in ("guru",):
            classes = {db.get(User, r.student_id).class_name for r in mine if r.actor_id == u.id and r.kind in ("wali_kelas", "dosen_pa")}
            scope = ", ".join(sorted(c for c in classes if c)) or "-"
        elif u.role == "wali":
            scope = ", ".join(db.get(User, r.student_id).nickname for r in mine if r.actor_id == u.id and r.kind == "wali")
        elif u.role == "bk":
            scope = "Koordinator BK" if u.is_coordinator else "Kasus yang ditugaskan"
        pending = any(r.status in ("menunggu_verifikasi", "menunggu_persetujuan") for r in mine)
        if u.pending_approval:
            status = "menunggu_akun"
        elif not u.active:
            status = "nonaktif"
        else:
            status = "menunggu" if pending else "aktif"
        out.append(
            {
                "id": u.id,
                "name": u.name,
                "email": u.email,
                "role": u.role,
                "role_name": ROLE_NAMES[u.role],
                "scope": scope,
                "status": status,
            }
        )
    return {"users": out, "counts": counts, "pending_accounts": pending_accounts}


class UserIn(BaseModel):
    name: str
    email: str = ""
    role: str
    class_name: str | None = None
    # khusus siswa
    nis: str | None = None
    level: str | None = None
    birth_date: date | None = None


@router.post("/users")
def create_user(body: UserIn, user: User = Depends(admin_only), db: Session = Depends(get_db)):
    if body.role not in ROLE_NAMES:
        raise HTTPException(422, "Peran tidak dikenal")
    if body.role == "wali":
        raise HTTPException(422, "Orang tua tidak dibuat manual. Buat kode undangan di halaman Kode akses.")
    import secrets

    if body.role == "siswa":
        return _create_student(body, user, db)
    email = body.email.strip().lower()
    if "@" not in email:
        raise HTTPException(422, "Email tidak valid")
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(409, "Email sudah terdaftar")

    temp_password = secrets.token_urlsafe(9)
    u = User(
        email=email,
        password_hash=hash_password(temp_password),
        name=body.name.strip(),
        nickname=body.name.strip().split(" ")[0],
        role=body.role,
        title=body.name.strip().split(" ")[0],
        institution_id=user.institution_id,
        class_name=body.class_name,
    )
    db.add(u)
    db.flush()
    audit.write(db, user, "tambah_pengguna", "pengguna", u.id, ROLE_NAMES[body.role], commit=False)
    db.commit()
    # Kata sandi sementara ditampilkan sekali kepada admin; produksi memakai SSO.
    return {"ok": True, "id": u.id, "temp_password": temp_password}


def _create_student(body: UserIn, user: User, db: Session) -> dict:
    """Siswa dibuat sekolah (seperti dari Dapodik), lalu mengaktifkan akun dengan kode."""
    import secrets

    nis = (body.nis or "").strip().upper()
    if not nis or db.scalar(select(User.id).where(User.nis == nis)):
        raise HTTPException(422 if not nis else 409, "Nomor induk wajib diisi" if not nis else "Nomor induk sudah terdaftar")
    if body.level not in ("sd", "smp", "sma", "kampus") or not (body.class_name or "").strip() or body.birth_date is None:
        raise HTTPException(422, "Lengkapi jenjang, kelas, dan tanggal lahir siswa")
    email = body.email.strip().lower() or f"{nis.lower()}@siswa.sekolah.local"
    if db.scalar(select(User.id).where(User.email == email)):
        raise HTTPException(409, "Email sudah terdaftar")
    name = " ".join(body.name.split())
    u = User(
        email=email,
        password_hash=hash_password(secrets.token_urlsafe(24)),
        name=name,
        nickname=name.split(" ")[0],
        role="siswa",
        nis=nis,
        level=body.level,
        class_name=body.class_name.strip(),
        birth_date=body.birth_date,
        ui_mode={"sd": "anak", "kampus": "kampus"}.get(body.level, "remaja"),
        institution_id=user.institution_id,
    )
    db.add(u)
    db.flush()
    while True:
        code = "S-" + secrets.token_hex(2).upper()
        if not db.scalar(select(Subject.id).where(Subject.code == code)):
            break
    sub = Subject(code=code, class_name=u.class_name, level=u.level)
    db.add(sub)
    db.flush()
    db.add(KeyMapping(user_id=u.id, subject_id=sub.id))
    ac = codes.issue(db, student=u, kind="aktivasi", by=user)
    audit.write(db, user, "tambah_pengguna", "pengguna", u.id, "Siswa", commit=False)
    db.commit()
    return {"ok": True, "id": u.id, "activation_code": ac.code}


class UserPatch(BaseModel):
    active: bool


@router.patch("/users/{uid}")
def patch_user(uid: int, body: UserPatch, user: User = Depends(admin_only), db: Session = Depends(get_db)):
    u = db.get(User, uid)
    if u is None:
        raise HTTPException(404, "Pengguna tidak ditemukan")
    if u.id == user.id:
        raise HTTPException(409, "Anda tidak dapat menonaktifkan akun sendiri")
    was_pending = u.pending_approval
    u.active = body.active
    if body.active:
        u.pending_approval = False
    action = "setujui_akun" if (was_pending and body.active) else "ubah_status_pengguna"
    audit.write(db, user, action, "pengguna", u.id, "aktif" if body.active else "nonaktif", commit=False)
    db.commit()
    return {"ok": True}


def _relation_json(db: Session, r: Relation) -> dict:
    a, s = db.get(User, r.actor_id), db.get(User, r.student_id)
    p = db.get(User, r.proposed_by) if r.proposed_by else None
    return {
        "id": r.id,
        "actor": a.title or a.name,
        "actor_role": ROLE_NAMES[a.role],
        "student": s.name,
        "student_class": s.class_name,
        "kind": r.kind,
        "status": r.status,
        "proposed_by": (p.title or p.name) if p else None,
        "proposed_by_id": r.proposed_by,
    }


@router.get("/relations")
def relations(user: User = Depends(approver), db: Session = Depends(get_db)):
    rows = db.scalars(select(Relation).order_by(Relation.status.desc(), Relation.id.desc()).limit(300)).all()
    return {"relations": [_relation_json(db, r) for r in rows], "me": user.id}


class RelationIn(BaseModel):
    actor_id: int
    student_id: int
    kind: str


@router.post("/relations")
def propose_relation(body: RelationIn, user: User = Depends(admin_only), db: Session = Depends(get_db)):
    if body.kind not in ("wali_kelas", "dosen_pa", "bk", "wali"):
        raise HTTPException(422, "Jenis relasi tidak dikenal")
    a, s = db.get(User, body.actor_id), db.get(User, body.student_id)
    if a is None or s is None or s.role != "siswa":
        raise HTTPException(422, "Pengguna atau siswa tidak valid")
    expected = {"wali_kelas": "guru", "dosen_pa": "guru", "bk": "bk", "wali": "wali"}[body.kind]
    if a.role != expected:
        raise HTTPException(422, f"Relasi {body.kind} harus untuk peran {ROLE_NAMES[expected]}")
    r = Relation(actor_id=a.id, student_id=s.id, kind=body.kind, status="menunggu_persetujuan", proposed_by=user.id)
    db.add(r)
    db.flush()
    audit.write(db, user, "usul_relasi", "relasi", r.id, f"{body.kind}: {a.name} → {s.name}", commit=False)
    db.commit()
    return _relation_json(db, r)


@router.post("/relations/{rid}/approve")
def approve_relation(rid: int, user: User = Depends(approver), db: Session = Depends(get_db)):
    r = db.get(Relation, rid)
    if r is None:
        raise HTTPException(404, "Relasi tidak ditemukan")
    if r.status not in ("menunggu_persetujuan", "menunggu_verifikasi"):
        raise HTTPException(409, "Relasi ini tidak menunggu persetujuan")
    if r.proposed_by == user.id:
        raise HTTPException(403, "Persetujuan 4 mata: relasi harus disetujui orang lain, bukan pengusulnya")
    r.status = "aktif"
    r.approved_by = user.id
    audit.write(db, user, "setujui_relasi", "relasi", r.id, commit=False)
    db.commit()
    return _relation_json(db, r)


@router.delete("/relations/{rid}")
def end_relation(rid: int, user: User = Depends(admin_only), db: Session = Depends(get_db)):
    r = db.get(Relation, rid)
    if r is None:
        raise HTTPException(404, "Relasi tidak ditemukan")
    r.status = "nonaktif"
    audit.write(db, user, "akhiri_relasi", "relasi", r.id, commit=False)
    db.commit()
    return {"ok": True}


# ── Kode akses (aktivasi siswa dan undangan orang tua) ───────────────────────


@router.get("/codes")
def list_codes(class_name: str = "", user: User = Depends(admin_only), db: Session = Depends(get_db)):
    classes = sorted({c for c in db.scalars(select(User.class_name).where(User.role == "siswa", User.class_name.is_not(None)))})
    cls = class_name or (classes[0] if classes else "")
    students = db.scalars(select(User).where(User.role == "siswa", User.class_name == cls).order_by(User.name)).all()
    all_codes = db.scalars(select(AccessCode).where(AccessCode.student_id.in_([s.id for s in students] or [-1])).order_by(AccessCode.id)).all()
    latest: dict[tuple[int, str], AccessCode] = {}
    for c in all_codes:
        latest[(c.student_id, c.kind)] = c
    guardians = {
        r.student_id
        for r in db.scalars(select(Relation).where(Relation.kind == "wali", Relation.status == "aktif", Relation.student_id.in_([s.id for s in students] or [-1])))
    }
    inst = db.get(Institution, user.institution_id)
    rows = []
    for s in students:
        row = {"id": s.id, "name": s.name, "nis": s.nis, "class_name": s.class_name, "level": s.level, "has_guardian": s.id in guardians}
        for kind in ("aktivasi", "undangan_wali"):
            c = latest.get((s.id, kind))
            row[kind] = {"code": c.code if c and codes.status_of(c) == "aktif" else None, "status": codes.status_of(c), "expires_at": c.expires_at.isoformat() if c else None, "id": c.id if c else None}
        rows.append(row)
    return {"classes": classes, "class_name": cls, "rows": rows, "institution": inst.name if inst else "", "valid_days": codes.VALID_DAYS}


class IssueIn(BaseModel):
    kind: str
    student_ids: list[int]


@router.post("/codes")
def issue_codes(body: IssueIn, user: User = Depends(admin_only), db: Session = Depends(get_db)):
    if body.kind not in ("aktivasi", "undangan_wali"):
        raise HTTPException(422, "Jenis kode tidak dikenal")
    if not body.student_ids or len(body.student_ids) > 300:
        raise HTTPException(422, "Pilih 1 sampai 300 siswa")
    issued = 0
    for sid in body.student_ids:
        s = db.get(User, sid)
        if s is None or s.role != "siswa":
            continue
        codes.issue(db, student=s, kind=body.kind, by=user)
        issued += 1
    audit.write(db, user, "buat_kode_akses", "kode", body.kind, f"{issued} kode", commit=False)
    db.commit()
    return {"ok": True, "issued": issued}


@router.post("/codes/{cid}/revoke")
def revoke_code(cid: int, user: User = Depends(admin_only), db: Session = Depends(get_db)):
    c = db.get(AccessCode, cid)
    if c is None:
        raise HTTPException(404, "Kode tidak ditemukan")
    c.revoked = True
    audit.write(db, user, "cabut_kode_akses", "kode", c.id, c.kind, commit=False)
    db.commit()
    return {"ok": True}


# ── A3 Aturan dan ambang ────────────────────────────────────────────────────

PARAM_SPECS = {
    "M1": {"response_hours": {"label": "Target respons (jam)", "min": 1, "max": 72}},
    "K1": {
        "min_indicators": {"label": "Jumlah indikator memburuk", "min": 1, "max": 4},
        "weeks": {"label": "Pekan berturut-turut", "min": 2, "max": 6},
    },
    "K2": {"threshold": {"label": "Ambang skor check-in", "min": 1, "max": 12}},
    "L": {"weeks": {"label": "Pekan membaik untuk pelepasan", "min": 1, "max": 6}},
}
RULE_TEXT = {
    "M1": "Tombol bantuan atau butir keselamatan memberi zona merah",
    "K1": "Dua atau lebih indikator memburuk tiga minggu berturut-turut memberi kuning",
    "K2": "Skor check-in sama atau di atas ambang memberi kuning (hanya bila siswa ikut check-in)",
    "L": "Pelepasan tanda: indikator membaik dua minggu berturut-turut",
}


def _validate_params(rule_id: str, params: dict) -> dict:
    spec = PARAM_SPECS.get(rule_id)
    if spec is None:
        raise HTTPException(422, "Aturan tidak dikenal")
    clean = dict(rules.DEFAULT_PARAMS[rule_id])
    for k, v in params.items():
        if k not in spec:
            continue
        if not isinstance(v, (int, float)) or not spec[k]["min"] <= v <= spec[k]["max"]:
            raise HTTPException(422, f"{spec[k]['label']} harus antara {spec[k]['min']} dan {spec[k]['max']}")
        clean[k] = int(v)
    return clean


def rule_json(db: Session, rv: RuleVersion) -> dict:
    p = db.get(User, rv.proposed_by) if rv.proposed_by else None
    a = db.get(User, rv.approved_by) if rv.approved_by else None
    return {
        "id": rv.id,
        "rule_id": rv.rule_id,
        "version": rv.version,
        "params": rv.params,
        "status": rv.status,
        "reason": rv.reason,
        "owner": rv.owner,
        "text": RULE_TEXT.get(rv.rule_id),
        "proposed_by": (p.title or p.name) if p else None,
        "proposed_by_id": rv.proposed_by,
        "approved_by": (a.title or a.name) if a else None,
        "created_at": rv.created_at.isoformat(),
        "decided_at": rv.decided_at.isoformat() if rv.decided_at else None,
    }


@router.get("/rules")
def get_rules(user: User = Depends(admin_only), db: Session = Depends(get_db)):
    rows = db.scalars(select(RuleVersion).order_by(RuleVersion.rule_id, RuleVersion.version.desc())).all()
    params = active_params(db)
    suggestions = get_setting(db, "bk_suggestions", {"items": []})["items"][-3:]
    return {
        "specs": PARAM_SPECS,
        "texts": RULE_TEXT,
        "active": params,
        "versions": [rule_json(db, r) for r in rows],
        "estimate": estimate_load(db, params),
        "k2_route": get_setting(db, "k2_route", {"to": "guru"})["to"],
        "bk_suggestions": suggestions,
    }


class EstimateIn(BaseModel):
    params: dict[str, dict]


@router.post("/rules/estimate")
def estimate(body: EstimateIn, user: User = Depends(admin_only), db: Session = Depends(get_db)):
    params = active_params(db)
    for rid, p in body.params.items():
        params[rid] = _validate_params(rid, p)
    return estimate_load(db, params)


class DraftIn(BaseModel):
    rule_id: str
    params: dict
    reason: str
    submit: bool = False


@router.post("/rules/draft")
def draft(body: DraftIn, user: User = Depends(admin_only), db: Session = Depends(get_db)):
    params = _validate_params(body.rule_id, body.params)
    if len(body.reason.strip()) < 10:
        raise HTTPException(422, "Tuliskan alasan perubahan (minimal 10 karakter)")
    last = db.scalar(select(func.max(RuleVersion.version)).where(RuleVersion.rule_id == body.rule_id)) or 0
    rv = RuleVersion(
        rule_id=body.rule_id,
        version=last + 1,
        params=params,
        status="diajukan" if body.submit else "draf",
        reason=body.reason.strip(),
        owner={"M1": "BK dan psikolog", "K1": "Psikolog, guru, BK", "K2": "Psikolog", "L": "Psikolog, komite"}[body.rule_id],
        proposed_by=user.id,
    )
    db.add(rv)
    db.flush()
    audit.write(db, user, "ajukan_aturan" if body.submit else "simpan_draf_aturan", "aturan", f"{rv.rule_id} v{rv.version}", commit=False)
    db.commit()
    return rule_json(db, rv)


@router.post("/rules/{rid}/submit")
def submit(rid: int, user: User = Depends(admin_only), db: Session = Depends(get_db)):
    rv = db.get(RuleVersion, rid)
    if rv is None or rv.status != "draf":
        raise HTTPException(409, "Hanya draf yang dapat diajukan")
    rv.status = "diajukan"
    audit.write(db, user, "ajukan_aturan", "aturan", f"{rv.rule_id} v{rv.version}", commit=False)
    db.commit()
    return rule_json(db, rv)


class RouteIn(BaseModel):
    to: str


@router.post("/settings/k2-route")
def k2_route(body: RouteIn, user: User = Depends(admin_only), db: Session = Depends(get_db)):
    if body.to not in ("guru", "bk"):
        raise HTTPException(422, "Pilihan tidak dikenal")
    s = db.get(Setting, "k2_route")
    if s:
        s.value = {"to": body.to}
    else:
        db.add(Setting(key="k2_route", value={"to": body.to}))
    audit.write(db, user, "ubah_rute_k2", "pengaturan", "k2_route", body.to, commit=False)
    db.commit()
    return {"ok": True, "to": body.to}


# ── A4 Kontak dan sumber daya ───────────────────────────────────────────────


@router.get("/resources")
def resources(user: User = Depends(admin_only), db: Session = Depends(get_db)):
    contacts = db.scalars(select(EmergencyContact).order_by(EmergencyContact.id)).all()
    items = db.scalars(select(LibraryItem).order_by(LibraryItem.id)).all()
    hours = db.scalars(select(ServiceHours).order_by(ServiceHours.weekday)).all()
    inst = db.get(Institution, user.institution_id)
    return {
        "contacts": [{**contact_json(c, admin_view=True), "verified": c.verified} for c in contacts],
        "library": [
            {"id": i.id, "title": i.title, "category": i.category, "label": i.label, "status": i.status, "source": i.source, "reviewed_by": i.reviewed_by}
            for i in items
        ],
        "hours": [{"weekday": h.weekday, "day": DAYS[h.weekday], "open": h.open_time, "close": h.close_time} for h in hours],
        "institution": inst.name if inst else None,
    }


class ContactIn(BaseModel):
    name: str
    kind: str
    phone: str | None = None
    hours: str | None = None
    verified: bool = False
    note: str | None = None


def _check_contact(body: ContactIn) -> None:
    if body.kind not in ("bk", "krisis", "kesehatan", "keamanan"):
        raise HTTPException(422, "Jenis kontak tidak dikenal")
    if body.verified and not (body.phone and body.phone.strip()):
        raise HTTPException(422, "Kontak tanpa nomor tidak dapat ditandai terverifikasi")
    if body.phone and not all(ch.isdigit() or ch in "+-() " for ch in body.phone):
        raise HTTPException(422, "Nomor telepon hanya boleh berisi angka, spasi, +, -, dan tanda kurung")


@router.post("/contacts")
def add_contact(body: ContactIn, user: User = Depends(admin_only), db: Session = Depends(get_db)):
    _check_contact(body)
    c = EmergencyContact(**body.model_dump())
    db.add(c)
    db.flush()
    audit.write(db, user, "tambah_kontak", "kontak", c.id, commit=False)
    db.commit()
    return contact_json(c, admin_view=True)


@router.put("/contacts/{cid}")
def edit_contact(cid: int, body: ContactIn, user: User = Depends(admin_only), db: Session = Depends(get_db)):
    c = db.get(EmergencyContact, cid)
    if c is None:
        raise HTTPException(404, "Kontak tidak ditemukan")
    _check_contact(body)
    for k, v in body.model_dump().items():
        setattr(c, k, v)
    audit.write(db, user, "ubah_kontak", "kontak", c.id, "terverifikasi" if c.verified else "belum diverifikasi", commit=False)
    db.commit()
    return contact_json(c, admin_view=True)


class LibraryPatch(BaseModel):
    status: str
    reviewed_by: str | None = None


@router.patch("/library/{lid}")
def patch_library(lid: int, body: LibraryPatch, user: User = Depends(admin_only), db: Session = Depends(get_db)):
    i = db.get(LibraryItem, lid)
    if i is None:
        raise HTTPException(404, "Konten tidak ditemukan")
    if body.status not in ("draf", "terbit"):
        raise HTTPException(422, "Status tidak dikenal")
    reviewer = body.reviewed_by or i.reviewed_by
    if body.status == "terbit" and not reviewer:
        raise HTTPException(422, "Konten harus ditinjau konselor sebelum terbit")
    i.status = body.status
    i.reviewed_by = reviewer
    audit.write(db, user, "ubah_status_konten", "pustaka", i.id, body.status, commit=False)
    db.commit()
    return {"ok": True}


class LibraryIn(BaseModel):
    title: str
    kind: str
    category: str
    source: str
    label: str
    summary: str
    body: str
    minutes: int = 3


@router.post("/library")
def add_library(body: LibraryIn, user: User = Depends(admin_only), db: Session = Depends(get_db)):
    if body.label not in ("Mandiri", "Info layanan"):
        raise HTTPException(422, "Label harus Mandiri atau Info layanan")
    i = LibraryItem(**body.model_dump(), status="draf")
    db.add(i)
    db.flush()
    audit.write(db, user, "tambah_konten", "pustaka", i.id, commit=False)
    db.commit()
    return {"ok": True, "id": i.id}


class HoursIn(BaseModel):
    days: list[dict]


@router.put("/hours")
def put_hours(body: HoursIn, user: User = Depends(admin_only), db: Session = Depends(get_db)):
    for d in body.days:
        h = db.scalars(select(ServiceHours).where(ServiceHours.weekday == int(d["weekday"]))).first()
        if h is None:
            continue
        o, c = d.get("open") or None, d.get("close") or None
        if (o and not c) or (c and not o) or (o and c and o >= c):
            raise HTTPException(422, f"Jam {DAYS[h.weekday]} tidak valid")
        h.open_time, h.close_time = o, c
    audit.write(db, user, "ubah_jam_layanan", "pengaturan", "jam", commit=False)
    db.commit()
    return {"ok": True}
