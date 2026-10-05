import { CircleCheck, KeyRound, Users } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { Banner, Button } from "../components/ui";
import { api } from "../lib/api";
import { ROLE_HOME, useAuth, type User } from "../lib/auth";
import { AuthIntro, PasswordField } from "./Login";

function useCodeInfo(code: string) {
  const [info, setInfo] = useState<null | { valid: boolean; status?: string; kind?: string; student?: { nickname: string; class_name: string } }>(null);
  useEffect(() => {
    const clean = code.replace(/[^a-z0-9]/gi, "");
    if (clean.length !== 8) {
      setInfo(null);
      return;
    }
    const t = setTimeout(() => {
      api<typeof info>(`/api/auth/code-info?code=${encodeURIComponent(code)}`)
        .then(setInfo)
        .catch(() => setInfo(null));
    }, 300);
    return () => clearTimeout(t);
  }, [code]);
  return info;
}

const STATUS_TEXT: Record<string, string> = {
  terpakai: "Kode ini sudah pernah dipakai.",
  kedaluwarsa: "Kode ini sudah kedaluwarsa. Minta kode baru ke sekolah.",
  dicabut: "Kode ini sudah diganti dengan kode baru.",
  belum_ada: "Kode tidak dikenal. Periksa lagi huruf dan angkanya.",
};

/** Siswa mengaktifkan akun dengan kartu kode dari wali kelas. Juga dipakai bila lupa kata sandi. */
export function Activate() {
  const { user, login } = useAuth();
  const [params] = useSearchParams();
  const [f, setF] = useState({ nis: "", code: params.get("kode") ?? "", email: "", password: "", confirm: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const info = useCodeInfo(f.code);
  if (user) return <Navigate to={user.role === "siswa" ? "/siswa/persetujuan" : ROLE_HOME[user.role]} replace />;
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (f.password !== f.confirm) return setError("Kedua kata sandi belum sama.");
    setBusy(true);
    try {
      const r = await api<{ token: string; user: User }>("/api/auth/activate", { method: "POST", json: { nis: f.nis, code: f.code, password: f.password, email: f.email || null } });
      login(r.token, r.user);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <AuthIntro />
      <main className="login-main" id="main">
        <div className="auth-card stack" style={{ gap: 18 }}>
          <span className="rc-icon" aria-hidden style={{ width: 44, height: 44, borderRadius: 12, display: "grid", placeItems: "center", background: "var(--primary-soft)", color: "var(--primary-dark)" }}>
            <KeyRound style={{ width: 22, height: 22 }} />
          </span>
          <div className="stack" style={{ gap: 6 }}>
            <h2 style={{ fontSize: 24 }}>Aktifkan akun siswa</h2>
            <p>Masukkan nomor induk dan kode dari kartu yang dibagikan wali kelas, lalu buat kata sandimu sendiri.</p>
          </div>
          {error && (
            <Banner kind="bad" role="alert">
              {error}
            </Banner>
          )}
          <form onSubmit={submit} className="stack" style={{ gap: 14 }}>
            <div className="field">
              <label className="label" htmlFor="nis">
                Nomor induk (NIS/NIM)
              </label>
              <input id="nis" name="nis" className="input" autoComplete="username" spellCheck={false} value={f.nis} onChange={(e) => set("nis")(e.target.value)} required />
            </div>
            <div className="field">
              <label className="label" htmlFor="code">
                Kode aktivasi
              </label>
              <input id="code" name="code" className="input mono" autoComplete="one-time-code" spellCheck={false} placeholder="Contoh: K7MP-2QXR…" value={f.code} onChange={(e) => set("code")(e.target.value.toUpperCase())} required style={{ letterSpacing: "0.08em" }} />
              {info?.valid && info.kind === "aktivasi" && (
                <span className="hint" style={{ color: "var(--ok)" }}>
                  <CircleCheck aria-hidden style={{ width: 14, height: 14, display: "inline", verticalAlign: "-2px" }} /> Kode untuk {info.student?.nickname} ({info.student?.class_name})
                </span>
              )}
              {info && !info.valid && <span className="field-error">{STATUS_TEXT[info.status ?? "belum_ada"]}</span>}
              {info?.valid && info.kind !== "aktivasi" && <span className="field-error">Ini kode undangan orang tua. <Link to={`/undangan?kode=${f.code}`}>Buka halaman undangan</Link></span>}
            </div>
            <PasswordField id="new-password" label="Buat kata sandi" autoComplete="new-password" value={f.password} onChange={set("password")} hint="Minimal 8 karakter. Jangan beri tahu siapa pun." />
            <PasswordField id="confirm-password" label="Ulangi kata sandi" autoComplete="new-password" value={f.confirm} onChange={set("confirm")} />
            <div className="field">
              <label className="label" htmlFor="email">
                Email <span className="muted">(boleh dikosongkan)</span>
              </label>
              <input id="email" name="email" className="input" type="email" autoComplete="email" spellCheck={false} value={f.email} onChange={(e) => set("email")(e.target.value)} />
              <span className="hint">Tanpa email, kamu tetap bisa masuk memakai nomor induk.</span>
            </div>
            <Button type="submit" loading={busy} block>
              Aktifkan dan masuk
            </Button>
          </form>
          <p className="small muted" style={{ textAlign: "center" }}>
            Lupa kata sandi? Minta kode baru ke wali kelas, lalu aktifkan lagi di halaman ini.
          </p>
          <p style={{ textAlign: "center" }} className="small">
            <Link to="/masuk" className="strong" style={{ color: "var(--primary)" }}>
              Kembali ke halaman masuk
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}

/** Orang tua membuat akun dari kode undangan sekolah; langsung terhubung ke anaknya. */
export function AcceptInvite() {
  const { user, login } = useAuth();
  const [params] = useSearchParams();
  const [f, setF] = useState({ code: params.get("kode") ?? "", name: "", email: "", password: "", confirm: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const info = useCodeInfo(f.code);
  if (user) return <Navigate to={ROLE_HOME[user.role]} replace />;
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (f.password !== f.confirm) return setError("Kedua kata sandi belum sama.");
    setBusy(true);
    try {
      const r = await api<{ token: string; user: User }>("/api/auth/accept-invite", { method: "POST", json: { code: f.code, name: f.name, email: f.email, password: f.password } });
      login(r.token, r.user);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <AuthIntro />
      <main className="login-main" id="main">
        <div className="auth-card stack" style={{ gap: 18 }}>
          <span aria-hidden style={{ width: 44, height: 44, borderRadius: 12, display: "grid", placeItems: "center", background: "var(--primary-soft)", color: "var(--primary-dark)" }}>
            <Users style={{ width: 22, height: 22 }} />
          </span>
          <div className="stack" style={{ gap: 6 }}>
            <h2 style={{ fontSize: 24 }}>Undangan untuk orang tua</h2>
            <p>Masukkan kode dari surat atau pesan sekolah. Akun Anda langsung terhubung dengan anak Anda.</p>
          </div>
          {error && (
            <Banner kind="bad" role="alert">
              {error}
            </Banner>
          )}
          <form onSubmit={submit} className="stack" style={{ gap: 14 }}>
            <div className="field">
              <label className="label" htmlFor="code">
                Kode undangan
              </label>
              <input id="code" name="code" className="input mono" autoComplete="one-time-code" spellCheck={false} placeholder="Contoh: H4TN-8WEB…" value={f.code} onChange={(e) => set("code")(e.target.value.toUpperCase())} required style={{ letterSpacing: "0.08em" }} />
              {info?.valid && info.kind === "undangan_wali" && (
                <span className="hint" style={{ color: "var(--ok)" }}>
                  <CircleCheck aria-hidden style={{ width: 14, height: 14, display: "inline", verticalAlign: "-2px" }} /> Kode untuk orang tua {info.student?.nickname} ({info.student?.class_name})
                </span>
              )}
              {info && !info.valid && <span className="field-error">{STATUS_TEXT[info.status ?? "belum_ada"]}</span>}
              {info?.valid && info.kind === "aktivasi" && <span className="field-error">Ini kode aktivasi siswa, bukan undangan orang tua.</span>}
            </div>
            <div className="field">
              <label className="label" htmlFor="name">
                Nama lengkap Anda
              </label>
              <input id="name" name="name" className="input" autoComplete="name" value={f.name} onChange={(e) => set("name")(e.target.value)} required />
            </div>
            <div className="field">
              <label className="label" htmlFor="email">
                Email
              </label>
              <input id="email" name="email" className="input" type="email" autoComplete="email" spellCheck={false} value={f.email} onChange={(e) => set("email")(e.target.value)} required />
            </div>
            <PasswordField id="new-password" label="Buat kata sandi" autoComplete="new-password" value={f.password} onChange={set("password")} hint="Minimal 8 karakter." />
            <PasswordField id="confirm-password" label="Ulangi kata sandi" autoComplete="new-password" value={f.confirm} onChange={set("confirm")} />
            <Button type="submit" loading={busy} block>
              Buat akun
            </Button>
          </form>
          <p className="small muted" style={{ textAlign: "center" }}>
            Sudah punya akun untuk anak lain? Masuk dulu, lalu tambahkan anak dengan kode ini di halaman Ringkasan.
          </p>
          <p style={{ textAlign: "center" }} className="small">
            <Link to="/masuk" className="strong" style={{ color: "var(--primary)" }}>
              Kembali ke halaman masuk
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
