import { ChartColumn, ChevronLeft, CircleCheck, GraduationCap, HeartHandshake, Inbox, Scale, Settings2, Users } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate } from "react-router-dom";
import { Banner, Button } from "../components/ui";
import { api } from "../lib/api";
import { ROLE_HOME, useAuth, type Role, type User } from "../lib/auth";
import { AuthIntro, PasswordField } from "./Login";

const ROLES: { id: Role; label: string; desc: string; icon: ReactNode; note: string }[] = [
  { id: "siswa", label: "Siswa atau mahasiswa", desc: "Mengatur izin data, check-in, dan membaca alasan bila disapa.", icon: <GraduationCap aria-hidden />, note: "Langsung bisa masuk." },
  { id: "wali", label: "Orang tua atau wali", desc: "Memberi persetujuan untuk anak dan menerima undangan guru BK.", icon: <Users aria-hidden />, note: "Hubungan dengan anak diverifikasi sekolah." },
  { id: "guru", label: "Guru wali kelas atau dosen PA", desc: "Menyapa siswa kelas binaan yang berada di zona kuning.", icon: <HeartHandshake aria-hidden />, note: "Menunggu persetujuan admin." },
  { id: "bk", label: "Guru BK atau konselor", desc: "Menangani kasus merah, catatan sesi, dan rujukan.", icon: <Inbox aria-hidden />, note: "Menunggu persetujuan admin." },
  { id: "admin", label: "Admin sekolah atau TI", desc: "Impor data, pengguna dan relasi, aturan, kontak.", icon: <Settings2 aria-hidden />, note: "Menunggu persetujuan admin." },
  { id: "pimpinan", label: "Pimpinan", desc: "Dasbor agregat tanpa data individu.", icon: <ChartColumn aria-hidden />, note: "Menunggu persetujuan admin." },
  { id: "komite", label: "Komite etik atau DPO", desc: "Log audit, keadilan, keberatan, registri aturan.", icon: <Scale aria-hidden />, note: "Menunggu persetujuan admin." },
];

const LEVELS = [
  { id: "sd", label: "SD" },
  { id: "smp", label: "SMP" },
  { id: "sma", label: "SMA/SMK" },
  { id: "kampus", label: "Kampus" },
];

export default function Register() {
  const { user, login } = useAuth();
  const [role, setRole] = useState<Role | null>(null);
  const [f, setF] = useState({ name: "", email: "", password: "", confirm: "", title: "", nis: "", level: "", class_name: "", birth_date: "", child_nis: "", agree: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [dest, setDest] = useState<string | null>(null);

  if (user) return <Navigate to={dest ?? ROLE_HOME[user.role]} replace />;
  const set = (k: keyof typeof f) => (v: string | boolean) => setF((s) => ({ ...s, [k]: v }));
  const staff = role && !["siswa", "wali"].includes(role);
  const meta = ROLES.find((r) => r.id === role);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (f.password !== f.confirm) {
      setError("Konfirmasi kata sandi belum sama.");
      return;
    }
    setBusy(true);
    const body: Record<string, unknown> = { role, name: f.name, email: f.email, password: f.password };
    if (role === "siswa") Object.assign(body, { nis: f.nis, level: f.level, class_name: f.class_name, birth_date: f.birth_date || null });
    if (role === "wali") body.child_nis = f.child_nis;
    if (staff) body.title = f.title || null;
    try {
      const r = await api<{ pending: boolean; message?: string; token?: string; user?: User }>("/api/auth/register", { method: "POST", json: body });
      if (r.pending) {
        setPending(r.message ?? "Pendaftaran terkirim.");
      } else if (r.token && r.user) {
        setDest(r.user.role === "siswa" ? "/siswa/persetujuan" : ROLE_HOME[r.user.role]);
        login(r.token, r.user);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <AuthIntro />
      <main className="login-main" id="main">
        {pending ? (
          <div className="auth-card stack" style={{ gap: 16, alignItems: "flex-start" }} role="status">
            <CircleCheck aria-hidden style={{ width: 36, height: 36, color: "var(--ok)" }} />
            <h2 style={{ fontSize: 24 }}>Pendaftaran terkirim</h2>
            <p>{pending}</p>
            <p className="small muted">Peran staf membuka akses ke data siswa, jadi akun baru diaktifkan oleh admin sekolah di halaman Pengguna dan relasi.</p>
            <Link to="/masuk" className="btn btn-primary">
              Kembali ke halaman masuk
            </Link>
          </div>
        ) : !role ? (
          <div className="stack" style={{ gap: 18 }}>
            <div className="stack" style={{ gap: 6 }}>
              <h2 style={{ fontSize: 24 }}>Daftar akun baru</h2>
              <p>Pilih peran Anda. Formulir menyesuaikan peran yang dipilih.</p>
            </div>
            <div className="role-grid">
              {ROLES.map((r) => (
                <button key={r.id} type="button" className="role-card" onClick={() => setRole(r.id)}>
                  <span className="rc-icon">{r.icon}</span>
                  <span className="rc-text">
                    <span className="rc-name">{r.label}</span>
                    <span className="rc-desc">{r.desc}</span>
                    <span className="rc-tag">{r.note}</span>
                  </span>
                </button>
              ))}
            </div>
            <p style={{ textAlign: "center" }}>
              Sudah punya akun?{" "}
              <Link to="/masuk" className="strong" style={{ color: "var(--primary)" }}>
                Masuk
              </Link>
            </p>
          </div>
        ) : (
          <div className="auth-card stack" style={{ gap: 18 }}>
            <button type="button" className="back-link btn-quiet" onClick={() => setRole(null)} style={{ border: 0, background: "none", cursor: "pointer", color: "var(--primary)", padding: 0, alignSelf: "flex-start" }}>
              <ChevronLeft aria-hidden /> Ganti peran
            </button>
            <div className="stack" style={{ gap: 6 }}>
              <h2 style={{ fontSize: 24 }}>Daftar sebagai {meta?.label.toLowerCase()}</h2>
              <p className="small muted">{meta?.note}</p>
            </div>
            {error && (
              <Banner kind="bad" role="alert">
                {error}
              </Banner>
            )}
            <form onSubmit={submit} className="stack" style={{ gap: 14 }}>
              <div className="field">
                <label className="label" htmlFor="name">
                  Nama lengkap
                </label>
                <input id="name" name="name" className="input" autoComplete="name" value={f.name} onChange={(e) => set("name")(e.target.value)} required minLength={3} />
              </div>
              {staff && (
                <div className="field">
                  <label className="label" htmlFor="title">
                    Sapaan <span className="muted">(opsional)</span>
                  </label>
                  <input id="title" name="title" className="input" autoComplete="off" placeholder="Misalnya: Bu Rina…" value={f.title} onChange={(e) => set("title")(e.target.value)} />
                  <span className="hint">Ditampilkan ke siswa, misalnya “Bu Rina ingin menyapa”.</span>
                </div>
              )}
              <div className="field">
                <label className="label" htmlFor="reg-email">
                  Email
                </label>
                <input id="reg-email" name="email" className="input" type="email" inputMode="email" autoComplete="email" spellCheck={false} value={f.email} onChange={(e) => set("email")(e.target.value)} required />
              </div>

              {role === "siswa" && (
                <>
                  <div className="field">
                    <label className="label" htmlFor="nis">
                      Nomor induk (NIS/NIM)
                    </label>
                    <input id="nis" name="nis" className="input" autoComplete="off" spellCheck={false} placeholder="Misalnya: MHS-2026-01…" value={f.nis} onChange={(e) => set("nis")(e.target.value)} required />
                    <span className="hint">Dipakai sekolah untuk mencocokkan data impor. Disimpan terpisah dari data analitik.</span>
                  </div>
                  <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
                    <legend className="label" style={{ marginBottom: 6 }}>
                      Jenjang
                    </legend>
                    <div className="filter-chips" role="radiogroup" aria-label="Jenjang">
                      {LEVELS.map((l) => (
                        <button key={l.id} type="button" role="radio" aria-checked={f.level === l.id} aria-pressed={f.level === l.id} className="filter-chip" onClick={() => set("level")(l.id)}>
                          {l.label}
                        </button>
                      ))}
                    </div>
                    {f.level === "sd" && <span className="hint">Siswa SD memakai mode anak: tanpa zona, angka, atau grafik.</span>}
                  </fieldset>
                  <div className="grid-2">
                    <div className="field">
                      <label className="label" htmlFor="class">
                        {f.level === "kampus" ? "Program studi" : "Kelas"}
                      </label>
                      <input id="class" name="class_name" className="input" autoComplete="off" placeholder={f.level === "kampus" ? "Misalnya: Teknik Informatika…" : "Misalnya: XI IPA 2…"} value={f.class_name} onChange={(e) => set("class_name")(e.target.value)} required />
                    </div>
                    <div className="field">
                      <label className="label" htmlFor="birth">
                        Tanggal lahir
                      </label>
                      <input id="birth" name="birth_date" className="input" type="date" autoComplete="bday" value={f.birth_date} onChange={(e) => set("birth_date")(e.target.value)} required />
                    </div>
                  </div>
                </>
              )}

              {role === "wali" && (
                <div className="field">
                  <label className="label" htmlFor="child">
                    Nomor induk anak
                  </label>
                  <input id="child" name="child_nis" className="input" autoComplete="off" spellCheck={false} placeholder="Misalnya: SIM-0004…" value={f.child_nis} onChange={(e) => set("child_nis")(e.target.value)} required />
                  <span className="hint">Anak harus sudah terdaftar. Sekolah memverifikasi hubungan Anda sebelum Anda melihat apa pun tentang anak.</span>
                </div>
              )}

              <PasswordField id="new-password" label="Kata sandi" autoComplete="new-password" value={f.password} onChange={(v) => set("password")(v)} hint="Minimal 8 karakter." />
              <PasswordField id="confirm-password" label="Ulangi kata sandi" autoComplete="new-password" value={f.confirm} onChange={(v) => set("confirm")(v)} />

              <label className="check">
                <input type="checkbox" checked={f.agree} onChange={(e) => set("agree")(e.target.checked)} required />
                <span className="small">Saya mengerti bahwa ini prototipe berdata SIMULASI dan bukan layanan darurat.</span>
              </label>
              <Button type="submit" loading={busy} block disabled={!f.agree || (role === "siswa" && !f.level)}>
                Daftar
              </Button>
            </form>
            <p style={{ textAlign: "center" }} className="small">
              Sudah punya akun?{" "}
              <Link to="/masuk" className="strong" style={{ color: "var(--primary)" }}>
                Masuk
              </Link>
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
