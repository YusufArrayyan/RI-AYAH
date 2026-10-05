import { ChevronLeft, Eye, HandHeart, ShieldCheck, Sprout } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth, ROLE_HOME } from "../lib/auth";

function Point({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="about-point">
      <span className="about-icon" aria-hidden>
        {icon}
      </span>
      <div className="stack" style={{ gap: 4 }}>
        <h3>{title}</h3>
        <p>{children}</p>
      </div>
    </div>
  );
}

/** Mengapa Ri'ayah: makna nama dan nilai yang dijaga aplikasi. */
export default function About() {
  const { user } = useAuth();
  const back = user ? ROLE_HOME[user.role] : "/masuk";
  return (
    <main className="about" id="main">
      <div className="about-inner">
        <Link to={back} className="back-link">
          <ChevronLeft aria-hidden /> {user ? "Kembali" : "Kembali ke halaman masuk"}
        </Link>

        <header className="about-hero">
          <span className="about-ar" lang="ar">
            رعاية
          </span>
          <div className="stack" style={{ gap: 8 }}>
            <h1>Mengapa namanya Ri'ayah?</h1>
            <p className="about-lead">
              <em>Ri'āyah</em> adalah kata Arab yang berarti <strong>menjaga dan memelihara dengan penuh perhatian</strong>. Akarnya, <em>ra'ā</em>, dipakai untuk penggembala yang
              menjaga dombanya.
            </p>
          </div>
        </header>

        <section className="about-section">
          <h2>Arti katanya</h2>
          <p>
            Dalam bahasa Arab sehari-hari, kata ini dipakai untuk layanan yang merawat manusia: <em>ri'āyah ṣiḥḥiyyah</em> berarti layanan kesehatan, dan <em>ri'āyah nafsiyyah</em> berarti
            pendampingan psikologis. Jadi nama ini bukan sekadar label. Ia menggambarkan apa yang ingin dilakukan aplikasi ini: <strong>merawat, bukan menilai</strong>.
          </p>
        </section>

        <section className="about-section">
          <h2>Tiga alasan memilih nama ini</h2>
          <div className="stack" style={{ gap: 16 }}>
            <Point icon={<Eye />} title="Penggembala memperhatikan lebih awal">
              Penggembala yang baik tahu ada domba yang mulai menjauh sebelum domba itu hilang. Ri'ayah bekerja dengan cara yang sama: melihat perubahan kecil, seperti mulai sering absen atau tugas
              menumpuk, sebelum masalahnya terlihat di nilai.
            </Point>
            <Point icon={<HandHeart />} title="Orang dewasa yang bertanggung jawab">
              Hadis yang masyhur menyebut, <em>“Kullukum rā'in wa kullukum mas'ūlun 'an ra'iyyatihi”</em>, artinya setiap kalian adalah penjaga dan akan dimintai pertanggungjawaban atas yang
              dijaganya (HR. Bukhari dan Muslim). Guru, orang tua, dan sekolah adalah penjaga itu. Karena itu, di Ri'ayah orang dewasalah yang lebih dulu mengajak ngobrol. Siswa tidak harus memulai sendiri.
            </Point>
            <Point icon={<ShieldCheck />} title="Menjaga, bukan mengawasi">
              Menjaga berbeda dengan memata-matai. Islam melarang <em>tajassus</em>, yaitu mencari-cari kesalahan orang lain (QS. Al-Hujurat: 12). Karena itu Ri'ayah tidak membaca pesan, media
              sosial, lokasi, atau ibadah siswa. Siswa memilih sendiri data apa yang boleh dibaca, dan bisa membatalkannya kapan saja.
            </Point>
          </div>
        </section>

        <section className="about-section">
          <h2>Nilai yang dijaga</h2>
          <ul className="about-values">
            <li>
              <strong>Ta'awun</strong>, tolong-menolong (QS. Al-Ma'idah: 2): bantuan datang dari manusia yang peduli, bukan dari mesin.
            </li>
            <li>
              <strong>Amanah</strong>: data siswa adalah titipan. Data itu disimpan terpisah, dicatat setiap kali dibuka, dan diawasi komite etik.
            </li>
            <li>
              <strong>Hifẓ al-nafs</strong>, menjaga jiwa: tombol “Butuh bantuan sekarang” selalu tersedia, kapan pun.
            </li>
          </ul>
        </section>

        <section className="about-section about-note">
          <Sprout aria-hidden />
          <p>
            Ri'ayah adalah pintu yang membawa siswa ke manusia yang peduli, dan tidak menggantikan manusia itu. Ri'ayah bukan layanan darurat dan tidak mendiagnosis.
          </p>
        </section>

        <p className="caption">Kutipan ayat dan hadis mengikuti esai Kerangka Ri'ayah. Teks dan terjemahannya perlu diperiksa ulang bersama ustadz atau dosen studi Islam sebelum dicetak.</p>
      </div>
    </main>
  );
}
