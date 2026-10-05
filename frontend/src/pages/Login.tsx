import { ChartColumn, GraduationCap, HeartHandshake, Inbox, Scale, Settings2, ShieldCheck, Smile, Users } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Banner, Button, Skeleton } from "../components/ui";
import { api, useResource } from "../lib/api";
import { ROLE_HOME, useAuth, type Role, type User } from "../lib/auth";

interface DemoAccount {
  email: string;
  name: string;
  title: string | null;
  role: Role;
  ui_mode: string | null;
  class_name: string | null;
  description: string;
}

const ROLE_ICON: Record<Role, ReactNode> = {
  siswa: <GraduationCap aria-hidden />,
  wali: <Users aria-hidden />,
  guru: <HeartHandshake aria-hidden />,
  bk: <Inbox aria-hidden />,
  admin: <Settings2 aria-hidden />,
  pimpinan: <ChartColumn aria-hidden />,
  komite: <Scale aria-hidden />,
};

const SCENARIO: Record<string, string> = {
  "nadia@demo.riayah.id": "Ditandai kuning; Bu Sari ingin menyapa",
  "alya@demo.riayah.id": "Mode anak: tanpa zona dan angka",
  "raka@demo.riayah.id": "Baru 18 tahun: perlu konfirmasi ulang",
  "dimas@demo.riayah.id": "Tidak ada penandaan",
  "rina@demo.riayah.id": "Wali Alya dan Nadia; ada undangan BK",
  "sari@demo.riayah.id": "Wali kelas XI IPA 2 dan XII IPS 1",
  "andi@demo.riayah.id": "Wali kelas 5A (SD)",
  "rahman@demo.riayah.id": "Koordinator BK; ada kasus merah baru",
  "maya@demo.riayah.id": "Guru BK; kasus yang diteruskan",
  "teguh@demo.riayah.id": "Mengusulkan aturan K2 v2",
  "ratna@demo.riayah.id": "Admin kedua untuk persetujuan 4 mata",
  "wulan@demo.riayah.id": "Kepala sekolah; hanya agregat",
  "hasan@demo.riayah.id": "Ketua komite etik",
  "lestari@demo.riayah.id": "Pejabat pelindungan data",
};

const ORDER: Role[] = ["siswa", "wali", "guru", "bk", "admin", "pimpinan", "komite"];

export default function Login() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const accounts = useResource<DemoAccount[]>("/api/auth/demo-accounts");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  if (user) return <Navigate to={ROLE_HOME[user.role]} replace />;

  const finish = (r: { token: string; user: User }) => {
    login(r.token, r.user);
    nav(ROLE_HOME[r.user.role], { replace: true });
  };

  const demo = async (em: string) => {
    setBusy(em);
    setError(null);
    try {
      finish(await api("/api/auth/demo-login", { method: "POST", json: { email: em } }));
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy("form");
    setError(null);
    try {
      finish(await api("/api/auth/login", { method: "POST", json: { email, password } }));
    } catch (err) {
      setError((err as Error).message);
      setBusy(null);
    }
  };

  const grouped = ORDER.map((role) => ({ role, items: (accounts.data ?? []).filter((a) => a.role === role) })).filter((g) => g.items.length);

  return (
    <div className="login">
      <section className="login-intro">
        <div className="stack" style={{ gap: 18 }}>
          <span className="big-ar" lang="ar" aria-hidden>
            رعاية
          </span>
          <h1>Pintu yang membawa siswa ke manusia yang peduli.</h1>
          <p style={{ fontSize: 17, maxWidth: "46ch" }}>
            Ri'ayah membantu sekolah dan kampus menyapa siswa yang menunjukkan tanda awal tertekan, sebelum masalahnya terlihat di nilai. Setiap
            penandaan membawa alasan yang bisa dibaca, dan manusia yang memutuskan langkah berikutnya.
          </p>
        </div>
        <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0, gap: 12 }}>
          {[
            ["Persetujuan dapat ditarik", "Siswa memilih data mana yang boleh dibaca, dan bisa berubah pikiran kapan saja."],
            ["Tanpa penginderaan pasif", "Tidak membaca pesan, media sosial, lokasi, atau keimanan."],
            ["Alasan terbuka", "Siswa dan guru membaca alasan yang sama dalam kalimat yang sama."],
          ].map(([t, d]) => (
            <li key={t} className="row nowrap-row" style={{ alignItems: "flex-start", gap: 12 }}>
              <ShieldCheck aria-hidden style={{ width: 22, height: 22, color: "var(--xai)", flex: "none", marginTop: 2 }} />
              <span>
                <strong className="strong">{t}.</strong> {d}
              </span>
            </li>
          ))}
        </ul>
        <p className="caption" style={{ marginTop: "auto" }}>
          Prototipe untuk Lomba KSPI Al-Qolam 2026 · PRD Ri'ayah v2. Ri'ayah bukan layanan darurat.
        </p>
      </section>

      <main className="login-main" id="main">
        <div className="stack" style={{ gap: 6 }}>
          <h2 style={{ fontSize: 22 }}>Masuk sebagai akun demo</h2>
          <p>Setiap peran hanya melihat layar miliknya. Pilih satu akun untuk mencoba alurnya.</p>
        </div>
        <Banner kind="warn">
          <strong>Data SIMULASI.</strong> Semua nama, kode siswa, nomor, dan angka adalah contoh fiktif. Di sekolah, masuk memakai SSO.
        </Banner>
        {error && <Banner kind="bad">{error}</Banner>}

        {accounts.loading && (
          <div className="role-grid">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} h={76} r={12} />
            ))}
          </div>
        )}
        {accounts.error && <Banner kind="bad">Daftar akun demo belum bisa dimuat. Pastikan server backend berjalan di port 8000.</Banner>}

        {grouped.map((g) => (
          <section key={g.role} className="stack" style={{ gap: 10 }} aria-labelledby={`grp-${g.role}`}>
            <h3 id={`grp-${g.role}`} style={{ fontSize: 15, color: "var(--body)" }}>
              {g.items[0].description}
            </h3>
            <div className="role-grid">
              {g.items.map((a) => (
                <button key={a.email} type="button" className="role-card" onClick={() => demo(a.email)} disabled={!!busy} aria-busy={busy === a.email || undefined}>
                  <span className="rc-icon">{a.ui_mode === "anak" ? <Smile aria-hidden /> : ROLE_ICON[a.role]}</span>
                  <span className="rc-text">
                    <span className="rc-name">
                      {a.title ?? a.name}
                      {a.class_name && <span className="muted" style={{ fontWeight: 600 }}> · {a.class_name}</span>}
                    </span>
                    <span className="rc-desc">{SCENARIO[a.email] ?? a.name}</span>
                    {busy === a.email && <span className="rc-tag">Masuk…</span>}
                  </span>
                </button>
              ))}
            </div>
          </section>
        ))}

        <details className="card">
          <summary style={{ cursor: "pointer", fontWeight: 700, color: "var(--ink)", minHeight: 28 }}>Masuk dengan email dan kata sandi</summary>
          <form onSubmit={submit} className="stack" style={{ marginTop: 14 }}>
            <div className="field">
              <label className="label" htmlFor="em">
                Email
              </label>
              <input id="em" name="email" className="input" type="email" autoComplete="username" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="field">
              <label className="label" htmlFor="pw">
                Kata sandi
              </label>
              <input id="pw" name="password" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              <span className="hint">Kata sandi akun demo tercatat di README proyek.</span>
            </div>
            <Button type="submit" loading={busy === "form"}>
              Masuk
            </Button>
          </form>
        </details>
      </main>
    </div>
  );
}
