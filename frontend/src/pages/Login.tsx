import { Eye, EyeOff, ShieldCheck } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Banner, Button } from "../components/ui";
import { api } from "../lib/api";
import { ROLE_HOME, useAuth, type User } from "../lib/auth";

/** Panel kiri bersama untuk layar Masuk dan Daftar. */
export function AuthIntro() {
  return (
    <section className="login-intro">
      <div className="stack" style={{ gap: 18 }}>
        <span className="big-ar" lang="ar" aria-hidden>
          رعاية
        </span>
        <h1>Pintu yang membawa siswa ke manusia yang peduli.</h1>
        <p style={{ fontSize: 17, maxWidth: "46ch" }}>
          Ri'ayah membantu sekolah dan kampus menyapa siswa yang menunjukkan tanda awal tertekan, sebelum masalahnya terlihat di nilai. Setiap penandaan membawa
          alasan yang bisa dibaca, dan manusia yang memutuskan langkah berikutnya.
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
  );
}

export function PasswordField({ id, value, onChange, autoComplete, label, hint }: { id: string; value: string; onChange: (v: string) => void; autoComplete: string; label: string; hint?: ReactNode }) {
  const [show, setShow] = useState(false);
  return (
    <div className="field">
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <div style={{ position: "relative" }}>
        <input
          id={id}
          name={id}
          className="input"
          type={show ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
          style={{ paddingRight: 52 }}
        />
        <button type="button" className="icon-btn" onClick={() => setShow((s) => !s)} aria-label={show ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"} style={{ position: "absolute", right: 2, top: 0 }}>
          {show ? <EyeOff aria-hidden style={{ width: 18, height: 18 }} /> : <Eye aria-hidden style={{ width: 18, height: 18 }} />}
        </button>
      </div>
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

export default function Login() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const notice = (loc.state as { notice?: string } | null)?.notice;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (user) return <Navigate to={ROLE_HOME[user.role]} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ token: string; user: User }>("/api/auth/login", { method: "POST", json: { email, password } });
      login(r.token, r.user);
      nav(ROLE_HOME[r.user.role], { replace: true });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <AuthIntro />
      <main className="login-main" id="main">
        <div className="auth-card stack" style={{ gap: 20 }}>
          <div className="stack" style={{ gap: 6 }}>
            <h2 style={{ fontSize: 24 }}>Masuk</h2>
            <p>Gunakan email dan kata sandi akun Anda. Setiap peran hanya melihat layar miliknya.</p>
          </div>
          {notice && <Banner kind="info">{notice}</Banner>}
          {error && (
            <Banner kind="bad" role="alert">
              {error}
            </Banner>
          )}
          <form onSubmit={submit} className="stack" style={{ gap: 14 }} noValidate={false}>
            <div className="field">
              <label className="label" htmlFor="email">
                Email
              </label>
              <input id="email" name="email" className="input" type="email" inputMode="email" autoComplete="username" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <PasswordField id="password" label="Kata sandi" autoComplete="current-password" value={password} onChange={setPassword} />
            <Button type="submit" loading={busy} block>
              Masuk
            </Button>
          </form>
          <hr className="divider" style={{ margin: 0 }} />
          <p style={{ textAlign: "center" }}>
            Belum punya akun?{" "}
            <Link to="/daftar" className="strong" style={{ color: "var(--primary)" }}>
              Daftar
            </Link>
          </p>
          <p className="caption" style={{ textAlign: "center" }}>
            Data di prototipe ini adalah SIMULASI. Di sekolah, masuk memakai SSO.
          </p>
        </div>
      </main>
    </div>
  );
}
