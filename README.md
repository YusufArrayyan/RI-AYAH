# Ri'ayah · رعاية

Platform pendampingan dini siswa dan mahasiswa. Ri'ayah membaca empat indikator keterlibatan yang sudah dimiliki sekolah (kehadiran, aktivitas belajar daring, tugas terlambat, tren nilai kuis) ditambah check-in sukarela, lalu memberi tiga zona dengan paling banyak tiga alasan dalam kalimat biasa. **Manusia yang memutuskan langkah berikutnya.**

> Prototipe untuk Lomba KSPI Al-Qolam 2026, dibangun dari *PRD Ri'ayah v2*. Semua nama, kode, nomor, dan angka adalah data **SIMULASI**.

## Isi

| Bagian | Isi |
|---|---|
| `PRODUCT.md` | Konteks produk: pengguna, tujuan, kepribadian, prinsip desain |
| `DESIGN.md` | Sistem desain (struktur DESIGN.md Wise, token dari PRD Bab 7 dan 14.2) |
| `backend/` | FastAPI + SQLAlchemy: mesin aturan, akses per peran, audit hash berantai, enkripsi, uji |
| `frontend/` | React + Vite + TypeScript: 26 layar dan 2 varian mode anak, responsif ponsel dan desktop |

### 28 layar menurut aktor

- **Siswa (ponsel):** S1 Beranda, S2 Persetujuan, S3 Mengapa saya ditandai, S4 Check-in, S5 Pustaka, S6 Privasi, S7 Bantuan sekarang, S1-A dan S3-A mode anak
- **Wali (ponsel):** W1 Persetujuan wali, W2 Ringkasan dan undangan BK, W3 Hak data anak
- **Guru/dosen PA:** G1 Daftar sapaan, G2 Detail kasus, G3 Panduan menyapa
- **Guru BK:** K1 Antrean, K2 Detail dan catatan, K3 Protokol krisis, K4 Beban layanan
- **Admin:** A1 Impor data, A2 Pengguna dan relasi, A3 Aturan dan ambang, A4 Kontak dan pustaka
- **Pimpinan:** P1 Dasbor agregat
- **Komite etik dan DPO:** E1 Log audit, E2 Keadilan, E3 Hak data dan keberatan, E4 Registri aturan dan XAI

## Menjalankan

Prasyarat: Python 3.11+ dan Node 20+.

```bash
cd backend
pip install -r requirements.txt
python -m uvicorn app.main:app --port 8000 --reload
```

```bash
cd frontend
npm install
npm run dev
```

Buka http://localhost:5173. Basis data SQLite dan data SIMULASI dibuat otomatis saat backend pertama kali jalan. Masuk dengan salah satu akun uji, atau buat akun baru lewat **Daftar**. Setiap peran hanya melihat layar miliknya.

Di Windows tersedia skrip `scripts/dev-api.cmd` (port 8010) dan `scripts/dev-web.cmd` (port 5180).

**Akun uji:** daftar lengkap ada di [`docs/Ri-ayah-akun-uji.pdf`](docs/Ri-ayah-akun-uji.pdf). Semua memakai kata sandi `riayah-demo-2026`, nilai uji untuk data SIMULASI, bukan kredensial produksi. Produksi memakai SSO (OIDC).

**Pendaftaran:** siswa/mahasiswa dan wali langsung bisa masuk; hubungan wali–anak diverifikasi admin. Peran staf (guru, BK, admin, pimpinan, komite) menunggu persetujuan admin di *Pengguna dan relasi*. Untuk memberi data ke siswa baru, admin memakai **Impor data → Templat untuk siswa baru**.

**Dokumen:** [`docs/Ri-ayah-alur-aplikasi.pdf`](docs/Ri-ayah-alur-aplikasi.pdf) berisi alur sistem, alur setiap peran, skenario demo juri, dan langkah uji dengan data baru. Sumber HTML-nya di `docs/src/`.

**Satu proses:** setelah `npm run build`, backend juga menyajikan `frontend/dist`, sehingga cukup menjalankan uvicorn lalu membuka http://localhost:8000.

**Mengulang data demo dari nol:**

```bash
cd backend
python -m app.seed --reset
```

### Skenario demo yang disiapkan

| Akun | Yang bisa dicoba |
|---|---|
| Nadia (siswa SMA) | Ditandai kuning K1: tiga alasan, grafik tren, kontrafaktual, tanggapan, keberatan |
| Alya (siswa SD) | Mode anak: wajah perasaan, sapaan satu kalimat tanpa zona atau angka |
| Raka (baru 18 tahun) | Konfirmasi ulang persetujuan (F21) |
| Ibu Rina (wali) | Persetujuan wali + asen anak, undangan BK tanpa zona, hak data anak |
| Bu Sari (wali kelas) | Daftar sapaan tanpa nama dan skor, catat sapaan dengan kode hasil |
| Pak Rahman (koordinator BK) | Kasus merah belum ditugaskan, catatan terenkripsi, rujukan, undang wali |
| Mas Teguh / Bu Ratna (admin) | Impor CSV yang membuang kolom terlarang, estimator beban, persetujuan 4 mata |
| Dr. Hasan (komite) | Verifikasi rantai audit, keadilan, putusan keberatan, menyetujui K2 v2, uji XAI |

## Uji

```bash
cd backend
python -m pytest -q
```

193 uji mencakup kriteria penerimaan PRD Bab 14.4, ditambah alur masuk dan daftar:

- **Tes peran:** setiap pasangan aktor dan objek data pada matriks Bab 3.2 (7 peran × 15 endpoint) terbukti diizinkan atau ditolak di sisi server.
- **Tes penjelasan:** alasan yang tampil sama dengan aturan yang dijalankan, dan saran kontrafaktual benar-benar melepas tanda (termasuk 40 riwayat acak dengan indikator lain terus memburuk).
- **Tes penarikan:** penarikan persetujuan menghentikan pemrosesan, menutup kasus, menjadwalkan penghapusan; tombol bantuan tetap bekerja.
- **Tes daftar:** validasi isian, staf menunggu persetujuan, wali menunggu verifikasi hubungan, dan alur data baru dari daftar sampai ditandai.
- Rantai audit mendeteksi entri yang diubah; membuka kasus menulis log sebelum data dikirim; mode anak tidak pernah menerima zona atau angka; kontak yang belum diverifikasi tersembunyi dari siswa.

## Aturan wajib PRD 14.3 dan penerapannya

| Aturan | Di mana |
|---|---|
| 1. Tanpa skor tunggal di layar siswa, guru, wali | `services.reasons_json`, `routers/teacher.py`, `routers/guardian.py` |
| 2. Tanpa analitik/iklan di layar siswa | Font di-host sendiri (`@fontsource`); tidak ada skrip pihak ketiga |
| 3. Peran dan relasi diperiksa di server | `access.py` (`require_role`, `require_teacher_case`, `require_counselor_case`, `require_guardian_of`) |
| 4. Log audit sebelum data sensitif dikirim | `audit.write` di awal endpoint detail kasus, check-in, keberatan |
| 5. Tombol bantuan di semua layar siswa, juga offline | `StudentShell`, `lib/offline.ts`, `public/sw.js` |
| 6. Nomor darurat tidak dikarang | `routers/common.py` menyembunyikan kontak belum terverifikasi dari siswa |
| 7. Label SIMULASI | `SimTag`, kotak SIMULASI di sidebar, data seed |
| 8. Perubahan aturan 4 mata + versi | `routers/admin.py` (usul), `routers/ethics.py` (setujui, menolak pengusul sendiri) |
| 9. Penarikan menghentikan pemrosesan seketika | `services.withdraw_all`, `access.processing_allowed` |
| 10. Mode anak tanpa zona/angka/"ditandai" | `routers/student.py` (`/me/flag` untuk `ui_mode == "anak"`) |

## Asumsi baru yang perlu diputuskan pemilik produk

Sesuai PRD 14.5, asumsi yang ditambahkan saat membangun:

1. **Warna:** `mute` digelapkan dari `#64808B` ke `#56707B`, dan token `line-strong #76909A` ditambahkan untuk tepi kontrol agar lolos WCAG AA (lihat DESIGN.md).
2. **Aturan L:** "membaik" berarti lebih baik minimal satu langkah dari nilai saat ditandai, selama L pekan; jumlah indikator yang harus membaik = jumlah pemicu − ambang K1 + 1.
3. **Bobot usaha kontrafaktual:** buka materi 0,15; hadir dan tugas 0,20; nilai kuis 0,30. Saran memprioritaskan hal yang bisa langsung dilakukan siswa.
4. **Butir check-in** hanya contoh (4 butir 0–3, ambang 8 dari 12, satu butir keselamatan). Instrumen final dipilih psikolog.
5. **Rute K2:** bawaan ke wali kelas sebagai "Ada tanda dari check-in"; admin dapat mengalihkan langsung ke BK (rekomendasi PRD 15.1 no. 6).
6. **Kapasitas BK:** 6 kasus aktif per konselor; ambang "Tinjau" pada keadilan: rasio di luar 0,8–1,25.
7. **Basis data:** SQLite untuk prototipe. Skema SQLAlchemy siap dipindah ke PostgreSQL dengan row-level security (PRD 10.2). Tabel `key_mapping` mewakili KMS/HSM.

Ri'ayah bukan layanan darurat.
