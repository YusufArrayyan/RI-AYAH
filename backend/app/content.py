"""Konten tetap: butir check-in contoh, panduan memulai obrolan, dan protokol krisis.

Semua konten di sini adalah DRAF dari perancang. Instrumen check-in belum dipilih (PRD 15.1
butir 5); panduan dan protokol wajib ditinjau psikolog dan konselor sebelum rilis.
"""

CHECKIN_CHOICES = [
    {"value": 0, "label": "Tidak pernah"},
    {"value": 1, "label": "Kadang-kadang"},
    {"value": 2, "label": "Sering"},
    {"value": 3, "label": "Hampir setiap hari"},
]

CHECKIN_ITEMS = [
    {"id": "lelah", "text": "Dalam seminggu terakhir, seberapa sering kamu merasa sangat capek, bahkan setelah istirahat?"},
    {"id": "fokus", "text": "Seberapa sering kamu sulit memusatkan perhatian saat belajar?"},
    {"id": "sendiri", "text": "Seberapa sering kamu merasa sendirian, walau ada orang di sekitarmu?"},
    {"id": "tidur", "text": "Seberapa sering tidurmu terganggu?"},
]

SAFETY_ITEM = {
    "id": "aman",
    "text": "Dalam seminggu terakhir, apakah ada saat kamu merasa tidak aman atau terpikir untuk menyakiti dirimu?",
    "choices": [{"value": True, "label": "Ya, ada"}, {"value": False, "label": "Tidak"}],
}

CHECKIN_NOTE = "Contoh butir. Instrumen final dipilih psikolog dan harus berlisensi untuk dipakai institusi."

TEACHER_GUIDE = {
    "reviewed": False,
    "try": [
        {"say": "“Nadia, Ibu perhatikan beberapa minggu ini kamu kelihatan lebih capek. Ibu cuma mau tahu kabarmu.”", "why": "Mulai dari kepedulian, bukan dari data."},
        {"say": "“Boleh cerita kalau mau. Kalau belum mau juga tidak apa-apa.”", "why": "Menolak harus terasa aman."},
        {"say": "“Ada yang bisa Ibu bantu supaya minggu depan lebih ringan?”", "why": "Mengajak mencari langkah kecil bersama."},
        {"say": "“Kalau mau, Ibu bisa kenalkan ke Pak Rahman di BK. Kamu yang memutuskan.”", "why": "Rujukan sebagai pilihan."},
    ],
    "avoid": [
        {"say": "“Sistem bilang kamu bermasalah.”", "why": "Memberi label dan menempatkan mesin sebagai hakim."},
        {"say": "“Nilai kamu turun terus, kenapa?”", "why": "Terdengar seperti teguran akademik."},
        {"say": "“Kamu harus ke BK.”", "why": "Perintah membuat siswa menutup diri."},
        {"say": "Mengajak ngobrol di depan teman sekelas.", "why": "Privasi siswa hilang; pilih tempat yang tenang."},
    ],
    "after": [
        "Catat di Ri'ayah bahwa Anda sudah mengajak ngobrol. Cukup pilih hasilnya, jangan tulis isi cerita siswa.",
        "Kalau siswa belum mau, coba lagi lain waktu, paling cepat seminggu kemudian.",
        "Kalau siswa butuh bantuan lebih, teruskan ke guru BK dari halaman siswa itu.",
        "Kalau siswa menyebut ingin menyakiti diri, tekan “Ada tanda bahaya”. Guru BK akan segera dihubungi.",
    ],
}

CRISIS_PROTOCOL = [
    {"title": "Pastikan keselamatan", "body": "Hubungi siswa dalam batas waktu. Tanyakan apakah ia aman saat ini dan di mana ia berada."},
    {"title": "Dengarkan tanpa menghakimi", "body": "Beri ruang bicara. Jangan menjanjikan kerahasiaan mutlak bila keselamatan terancam."},
    {"title": "Libatkan pendamping", "body": "Untuk siswa di bawah 18 tahun, hubungi wali sesuai prosedur sekolah. Untuk mahasiswa, tawarkan menghubungi orang yang ia percaya."},
    {"title": "Rujuk bila perlu", "body": "Hubungi layanan klinis atau darurat dari tabel kontak. Isi formulir rujukan agar riwayatnya tercatat."},
    {"title": "Tindak lanjut dan catat", "body": "Jadwalkan kontak ulang dalam 48 jam. Catat tindakan dengan kode hasil; isi percakapan masuk catatan terenkripsi."},
]

OUTCOME_CODES = {
    "guru": ["Sudah ngobrol, siswa baik-baik saja", "Sudah ngobrol, siswa ingin cerita lagi", "Siswa belum mau", "Belum bertemu siswa"],
    "bk": ["Sesi pertama selesai", "Perlu sesi lanjutan", "Dirujuk ke layanan klinis", "Wali dihubungi", "Tidak memerlukan tindak lanjut"],
}
