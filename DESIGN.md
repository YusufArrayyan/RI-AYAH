---
version: 1.0
name: Riayah-design-system
description: Sistem desain Ri'ayah v2 — platform pendampingan dini siswa dan mahasiswa. Latar terang kebiruan, teal tenang sebagai satu-satunya aksen aksi, violet khusus untuk penjelasan (XAI) dan Lapis 3, zona selalu ditulis dengan kata dan ikon. Struktur dokumen mengikuti DESIGN.md Wise (awesome-design-md); palet dan huruf berasal dari PRD Bab 7 dan 14.2, dengan dua koreksi kontras yang dicatat di bawah.

colors:
  primary: "#0E7490"
  primary-dark: "#155E75"
  primary-soft: "#DDF0F5"
  on-primary: "#FFFFFF"
  ink: "#0F2A33"
  body: "#3D5560"
  mute: "#56707B"        # PRD: #64808B (3,89:1 di canvas) → digelapkan agar ≥ 4,5:1
  canvas: "#F2F7F8"
  card: "#FFFFFF"
  hairline: "#CFDDE2"    # tepi kartu dan pemisah (dekoratif)
  line-strong: "#76909A" # tambahan: tepi kontrol interaktif, ≥ 3:1 di putih
  ok: "#1F7A4D"
  ok-soft: "#DDF1E6"
  warn-fill: "#F5C242"   # hanya bidang dan grafik, tidak untuk teks
  warn-text: "#8A5A00"
  warn-soft: "#FCF0CC"
  bad: "#B42318"
  bad-soft: "#FBE1DE"
  xai: "#5B4B9A"
  xai-soft: "#ECE8F6"
  child-canvas: "#FFF6EA" # mode anak saja, ditetapkan PRD 7.9

typography:
  screen-title:
    fontFamily: Atkinson Hyperlegible Next, system-ui, Arial, sans-serif
    fontSize: 24px
    fontWeight: 700
    lineHeight: 1.25
  card-title:
    fontFamily: Atkinson Hyperlegible Next, system-ui, sans-serif
    fontSize: 17px
    fontWeight: 700
    lineHeight: 1.3
  body:
    fontFamily: Atkinson Hyperlegible Next, system-ui, sans-serif
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
  body-dense:
    fontFamily: Atkinson Hyperlegible Next, system-ui, sans-serif
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: Atkinson Hyperlegible Next, system-ui, sans-serif
    fontSize: 13px
    fontWeight: 600
    lineHeight: 1.4
  caption:
    fontFamily: Atkinson Hyperlegible Next, system-ui, sans-serif
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.4
  child-title:
    fontFamily: Baloo 2, Atkinson Hyperlegible Next, sans-serif
    fontSize: 28px
    fontWeight: 700
    lineHeight: 1.2
  child-body:
    fontFamily: Atkinson Hyperlegible Next, sans-serif
    fontSize: 19px
    fontWeight: 400
    lineHeight: 1.5
  wordmark-ar:
    fontFamily: Amiri, serif
    fontSize: 26px
    fontWeight: 700
  mono:
    fontFamily: IBM Plex Mono, ui-monospace, monospace
    fontSize: 13px
    fontWeight: 500

rounded:
  chip: 9999px
  control: 10px
  card: 12px
  sheet: 16px

spacing:
  1: 4px
  2: 8px
  3: 12px
  4: 16px
  5: 20px
  6: 24px
  8: 32px
  10: 40px
  12: 48px

layout:
  sidebar: 250px
  content-max: 1090px
  student-column: 640px
  gutter-mobile: 16px
  touch-min: 44px

components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.control}"
    minHeight: 44px
  button-ghost:
    backgroundColor: "{colors.card}"
    textColor: "{colors.primary-dark}"
    borderColor: "{colors.line-strong}"
    rounded: "{rounded.control}"
    minHeight: 44px
  button-danger:
    backgroundColor: "{colors.bad}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.control}"
    minHeight: 44px
  help-button:
    backgroundColor: "{colors.bad}"
    textColor: "{colors.on-primary}"
    width: 100%
    minHeight: 52px
  zone-chip:
    shape: "{rounded.chip}"
    content: "ikon + kata zona + kata kerja (Kuning: sapaan)"
  reason-card:
    backgroundColor: "{colors.card}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.card}"
    chartHeight: 120px
  xai-box:
    backgroundColor: "{colors.xai-soft}"
    borderColor: "{colors.xai}"
    textColor: "{colors.ink}"
    label: "XAI"
  consent-switch:
    trackOff: "{colors.line-strong}"
    trackOn: "{colors.primary}"
    status: "Aktif sejak <tanggal>"
  table:
    headerBackground: "{colors.canvas}"
    rowHeight: 48px
  banner:
    variants: [info teal, peringatan kuning, bahaya merah, penjelasan violet]
  bottom-nav:
    maxItems: 5
  sidebar:
    width: 250px
    footer: kotak SIMULASI
---

## Overview

Ri'ayah dipakai oleh orang yang sedang rapuh dan perlu percaya, dan oleh orang yang ingin menolong mereka. Pertanyaan desainnya satu: bagaimana layar terlihat dan terdengar agar siswa merasa memegang kendali, sementara guru tahu siapa yang perlu disapa, mengapa, dan sampai kapan.

Jawabannya adalah antarmuka yang tenang dan jujur. Halaman memakai latar terang kebiruan `{colors.canvas}` dengan kartu putih bertepi tipis 1,5 px. Bayangan tidak dipakai. Teal `{colors.primary}` adalah satu-satunya warna aksi. Violet `{colors.xai}` adalah bahasa visual kedua yang dipakai dengan disiplin: ia hanya muncul pada penjelasan, audit, dan Lapis 3 (Penjaga Amanah), sehingga pembaca belajar bahwa kotak violet berarti "ini alasannya" atau "ini jaminannya".

**Adegan fisik.** Seorang mahasiswa membuka Ri'ayah di ponsel pada malam hari di kamar kos, setelah notifikasi pesan dari dosen PA. Seorang guru BK membukanya di laptop sekolah pada siang hari di antara dua sesi. Keduanya memerlukan latar terang yang lembut, teks besar yang mudah dibaca, dan tidak ada yang berteriak. Tema terang dipilih karena dua pembaca itu, bukan karena kebiasaan.

**Ciri utama:**
- Satu aksen aksi (teal) dan satu aksen penjelasan (violet). Warna zona hanya untuk zona.
- Zona selalu memakai kata, ikon, dan bentuk sekaligus: lingkaran hijau, segitiga kuning, segi delapan merah. Warna tidak pernah menjadi satu-satunya sinyal.
- Setiap permintaan punya tombol penolakan bergaya ghost dengan tinggi yang sama. Penolakan tidak boleh tampil sebagai teks abu.
- Tombol "Butuh bantuan sekarang" (merah, selebar layar) ada di semua layar siswa.
- Panel "Yang kami baca / Yang tidak kami baca" adalah komponen khas Ri'ayah.
- Wordmark memasangkan "Ri'ayah" (Atkinson) dengan "رعاية" (Amiri).

## Colors

### Aksi dan identitas
- **Primary** (`#0E7490`): tombol utama, tautan, item navigasi aktif. Kontras 5,36:1 di putih.
- **Primary dark** (`#155E75`): teks di atas primary-soft, judul seksi, tepi tombol ghost aktif.
- **Primary soft** (`#DDF0F5`): latar item aktif, kartu info, chip filter terpilih.

### Permukaan dan teks
- **Canvas** (`#F2F7F8`): latar halaman. Netral dingin dengan sedikit teal, tidak krem.
- **Card** (`#FFFFFF`): kartu, tabel, panel.
- **Ink** (`#0F2A33`): judul dan teks utama.
- **Body** (`#3D5560`): teks isi, 7,29:1 di canvas.
- **Mute** (`#56707B`): teks pendukung. Nilai PRD `#64808B` hanya 3,89:1 di canvas, sehingga digelapkan menjadi 4,86:1. Di atas primary-soft, teks pendukung memakai body.
- **Hairline** (`#CFDDE2`): tepi kartu dan pemisah. Bersifat dekoratif dan tidak dipakai untuk batas kontrol.
- **Line strong** (`#76909A`): tambahan untuk tepi input, saklar mati, dan tombol ghost, karena komponen UI memerlukan kontras 3:1.

### Zona (hanya untuk zona dan status)
- **Hijau** `ok #1F7A4D` / `ok-soft #DDF1E6`: teks dan tepi; soft untuk bidang.
- **Kuning** `warn-fill #F5C242` hanya untuk bidang dan grafik; teks memakai `warn-text #8A5A00` di atas `warn-soft #FCF0CC` (5,21:1). Pada grafik tren, segmen pemicu digambar dengan garis `warn-text` di atas pita `warn-soft`, karena isian kuning hanya 1,66:1 di putih.
- **Merah** `bad #B42318` / `bad-soft #FBE1DE`: tombol bantuan, kasus merah, aksi destruktif.

### Penjelasan
- **XAI** `#5B4B9A` / `#ECE8F6`: semua yang menyangkut alasan, audit, dan Penjaga Amanah. Tidak pernah dipakai sebagai hiasan.

### Mode anak
- **Child canvas** `#FFF6EA`: latar hangat yang diminta PRD 7.9, hanya untuk mode anak. Teks body di atasnya 7,36:1.

## Typography

Satu keluarga huruf untuk produk: **Atkinson Hyperlegible Next**, yang dirancang untuk keterbacaan pembaca dengan penglihatan rendah. Aplikasi produk tidak memerlukan pasangan huruf display; hierarki dibangun dari ukuran dan ketebalan.

| Peran | Ukuran / tebal | Tinggi baris | Pemakaian |
|---|---|---|---|
| Judul layar | 24 px / 700 | 1,25 | Satu per layar |
| Judul kartu | 17 px / 700 | 1,3 | |
| Isi | 16 px / 400 | 1,5 | Minimum di ponsel |
| Isi padat | 14 px / 400 | 1,45 | Tabel desktop saja |
| Label | 13 px / 600 | 1,4 | Label form, kepala kolom |
| Caption | 12 px / 400 | 1,4 | Tidak ada isi di bawah 12 px |
| Judul mode anak | 28 px / 700 Baloo 2 | 1,2 | Judul dan tombol mode anak |
| Isi mode anak | 19 px / 400 | 1,5 | |

- **Amiri** hanya untuk wordmark Arab "رعاية" di sidebar dan layar masuk. Ukurannya dekoratif, bukan isi.
- **IBM Plex Mono** untuk kode siswa (S-7F3A) dan hash log audit.
- Huruf kapital hanya untuk kepala kolom tabel. Tidak ada eyebrow kecil berspasi lebar di atas seksi.
- Font di-host sendiri (`@fontsource`), sehingga layar siswa tidak memanggil server pihak ketiga (aturan wajib 14.3.2).

## Layout

### Spasi
Kelipatan 4 dan 8 px. Padding kartu 16 px di ponsel dan 18 px di desktop; jarak antar kartu 12 sampai 16 px. Ritme vertikal sengaja bervariasi: jarak antar seksi 32 px, antar kartu dalam seksi 12 px.

### Kerangka
- **Siswa dan wali** (ponsel lebih dulu): satu kolom, gutter 16 px, navigasi bawah maksimal 5 item, tombol bantuan menempel di atas navigasi bawah. Pada desktop ≥ 1024 px, navigasi bawah berubah menjadi sidebar 250 px dan isi dibatasi kolom 640 px agar kalimat tetap pendek.
- **Staf** (desktop lebih dulu): sidebar 250 px dan isi maksimum 1090 px. Di bawah 1024 px, sidebar menjadi laci yang dibuka dari bilah atas. Tabel menjadi daftar kartu bertumpuk di bawah 720 px.

### Breakpoint
| Nama | Lebar | Perubahan |
|---|---|---|
| Ponsel | < 720 px | Satu kolom, tabel menjadi daftar, navigasi bawah |
| Tablet | 720–1023 px | Grid 2 kolom, staf memakai laci |
| Desktop | ≥ 1024 px | Sidebar tetap, grid penuh |

## Elevation & Depth

Bayangan tidak dipakai. Kedalaman berasal dari kartu putih di atas canvas kebiruan, ditambah tepi 1,5 px `{colors.hairline}`. Lapisan modal dan laci memakai backdrop ink 40% dan satu-satunya bayangan lembut di sistem, agar jelas mengambang.

Skala z-index: `sticky 10 → drawer 20 → backdrop 30 → dialog 40 → toast 50`.

## Shapes

| Token | Nilai | Pemakaian |
|---|---|---|
| chip | 9999 px | Chip zona, chip filter, badge |
| control | 10 px | Tombol, input, saklar |
| card | 12 px | Kartu, tabel, panel |
| sheet | 16 px | Dialog, laci bawah |

Bentuk zona: hijau = lingkaran, kuning = segitiga, merah = segi delapan. Bentuk ini muncul di dalam chip zona agar zona terbaca tanpa warna.

## Components

### Tombol
- **Primary**: latar teal, teks putih, tinggi minimum 44 px. Satu per layar.
- **Ghost**: latar putih, tepi `line-strong`, teks primary-dark. Dipakai untuk aksi kedua dan untuk **semua tombol penolakan**, dengan ukuran yang sama dengan tombol utama di sebelahnya.
- **Danger**: merah, hanya untuk bantuan dan hapus.
- **Help button**: merah, selebar layar, tinggi 52 px, ikon tangan, berlabel "Butuh bantuan sekarang" (mode anak: "Aku butuh bantuan").
- State: hover (gelap 6%), focus-visible (cincin 3 px primary dengan offset 2 px), active, disabled (opasitas 0,5 plus kursor), loading (label tetap, spinner kecil di depan).

### Chip zona
Ikon bentuk, lalu kata zona dan kata kerjanya: "Kuning: sapaan", "Merah: kontak BK", "Hijau". Di layar siswa diikuti "bukan diagnosis". Tidak pernah tampil di mode anak atau di layar wali.

### Saklar izin
Label dan keterangan satu baris, lalu status berupa teks "Aktif sejak 2 Sep 2026" atau "Tidak aktif". Kontrolnya `role="switch"` dengan target 44 px.

### Kartu alasan
Judul alasan dalam kalimat biasa, keterangan angka, dan grafik tren 120 px dengan titik terakhir bertanda. Segmen yang memicu diberi warna kuning dan label teks. Ringkasan teks grafik tersedia untuk pembaca layar.

### Kotak XAI
Latar xai-soft, tepi 1,5 px violet, label kecil "XAI" berupa badge violet, isi satu sampai tiga kalimat. Dipakai untuk kontrafaktual ("Apa yang bisa mengubah penandaan ini"), "Yang tidak ditampilkan kepada Anda", dan penjelasan agregat.

### Panel "Yang kami baca / Yang tidak kami baca"
Dua kolom: daftar centang teal dan daftar silang abu. Muncul di S2, W1, dan A1.

### Banner
Satu kalimat dengan ikon di depan. Varian: info (teal), peringatan (kuning), bahaya (merah), penjelasan (violet). Tepi penuh dan latar soft; tidak ada garis tebal di sisi kiri.

### Tabel
Kepala kolom canvas, huruf kapital 12 px, baris 48 px, aksi di kolom terakhir. Daftar memakai kode siswa, bukan nama. Di bawah 720 px setiap baris menjadi kartu.

### Navigasi
- **Navigasi bawah** (ponsel): maksimal 5 item, ikon dan label, item aktif tebal dengan indikator teal di atas ikon.
- **Sidebar** (desktop): 250 px, wordmark, item ikon dan label, kotak SIMULASI di dasar, lalu identitas pengguna dan tombol keluar.

### Kotak konfirmasi
Untuk hapus, tarik izin, dan tutup kasus. Judul berupa pertanyaan, akibatnya disebut dalam satu kalimat, dan tombol batal setara dengan tombol lanjut. Memakai `<dialog>` native.

### Keadaan kosong, memuat, galat, offline
- Kosong: ikon kecil, satu kalimat, satu aksi. Tidak ada wajah sedih.
- Memuat: kerangka abu berdenyut lembut. Dimatikan bila pengguna memilih kurangi gerak.
- Galat: menyebut apa yang terjadi dan apa yang bisa dilakukan, ditambah tombol "Coba lagi".
- Offline: banner "Tidak ada koneksi". Tombol bantuan tetap menampilkan kontak yang tersimpan di perangkat.

### Grafik
Garis untuk tren, dengan titik terakhir bertanda. Batang horizontal dengan angka tertulis untuk perbandingan. Tidak ada pai, radar, atau peringkat. Sel agregat di bawah 10 orang disembunyikan dengan keterangan.

## Mode anak

Komponen sama, bahasa visual lebih hangat. Latar `{colors.child-canvas}`, judul Baloo 2, teks 19 px. Tidak ada zona, angka, grafik, atau kata "ditandai". Lima wajah perasaan digambar sebagai SVG sederhana (senang, biasa, capek, sedih, kesal). Pesan sapaan memuat satu kalimat dan tiga tombol setara: Boleh, Aku belum mau, Itu tidak benar. Setiap layar menyatakan bahwa menolak tidak apa-apa dan nilai tidak berubah.

## Motion

Transisi 150 sampai 250 ms hanya untuk perubahan keadaan (saklar, tab, laci, dialog), dengan easing ease-out-quart `cubic-bezier(0.25, 1, 0.5, 1)`. Tidak ada animasi otomatis, rangkaian masuk halaman, pantulan, atau confetti. `prefers-reduced-motion: reduce` mematikan denyut kerangka dan mengganti geser menjadi pudar instan.

## Voice

| Hindari | Pakai |
|---|---|
| "Kamu berisiko mengalami gangguan jiwa" | "Ada beberapa hal yang berubah. Bu Sari ingin menyapa." |
| "Sistem mendeteksi masalahmu" | "Ini yang kami lihat dan mengapa" |
| "Kamu wajib ke BK" | "Mau cerita ke Bu Sari?" |
| "Pantau kondisi siswa" | "Dampingi siswa" |
| "Skor risiko 8/12" | "Beberapa jawabanmu menunjukkan kamu mungkin lelah" |
| "Data Anda dikumpulkan" | "Ini data yang kamu izinkan kami baca" |

Kata "memantau", "pengawasan", "pasien", "bermasalah", dan "berisiko" tidak muncul di antarmuka.

### Kosakata sehari-hari (layar siswa, orang tua, guru)

| Istilah PRD | Yang tampil di layar |
|---|---|
| menyapa, sapaan | mengajak ngobrol, ngobrol |
| ditandai, penandaan | ada perubahan yang kami lihat, tanda |
| Kuning: sapaan / Merah: kontak BK | Kuning: perlu diajak ngobrol / Merah: segera dihubungi BK |
| kontrafaktual | Kapan tanda ini hilang? |
| asen anak | persetujuan anak |
| pekan | minggu |
| aktivitas belajar daring, tugas terlambat | belajar online, tugas telat |
| pustaka dukungan | bacaan dan latihan |
| kode hasil tindak lanjut | hasil obrolan (tanpa isi cerita) |

Istilah teknis (K1, K2, kontrafaktual, XAI) tetap dipakai di layar BK, admin, dan komite karena dibutuhkan untuk audit.

### Paragraf

Rata kiri, tidak rata kiri-kanan (justify): justify membuat jarak antarkata tidak rata di layar sempit dan menyulitkan pembaca disleksia (WCAG 1.4.8). Kerapian dicapai dengan lebar baris 42–65 karakter, tinggi baris 1,6–1,7, dan `text-wrap: pretty`.

## Do's and Don'ts

### Do
- Tulis zona dengan kata dan bentuk, bukan hanya warna.
- Beri setiap permintaan tombol penolakan dengan bobot setara.
- Pakai violet hanya untuk penjelasan dan jaminan.
- Tandai semua data contoh dengan SIMULASI.
- Sebut akibat dalam satu kalimat pada setiap konfirmasi destruktif.

### Don't
- Jangan tampilkan skor tunggal atau probabilitas di layar siswa, guru, atau wali.
- Jangan pakai bayangan, gradien, glassmorphism, atau garis tebal di sisi kiri kartu.
- Jangan buat peringkat siswa, kelas, atau guru.
- Jangan karang nomor darurat. Bila belum diisi, sembunyikan dari siswa dan beri tahu admin.
- Jangan pakai wajah sedih di keadaan kosong.
