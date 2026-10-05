import {
  BookOpen,
  ClipboardCheck,
  FileUp,
  Gauge,
  HandHeart,
  HeartHandshake,
  House,
  KeyRound,
  LifeBuoy,
  ListChecks,
  LogOut,
  Menu,
  MessageSquareText,
  Scale,
  ScrollText,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  WifiOff,
  ChartColumn,
  Inbox,
  Gavel,
  Phone,
  X,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { ROLE_LABEL, useAuth, type Role } from "../lib/auth";
import { initials } from "../lib/format";
import { refreshContacts, useOnline } from "../lib/offline";

export function Wordmark({ small, to = "/" }: { small?: boolean; to?: string }) {
  return (
    <Link to={to} className={`wordmark ${small ? "sm" : ""}`} aria-label="Ri'ayah, ke beranda" translate="no">
      <span className="wm-latin">Ri'ayah</span>
      <span className="wm-ar" lang="ar" aria-hidden>
        رعاية
      </span>
    </Link>
  );
}

function useRootClasses(classes: Record<string, boolean>) {
  const key = JSON.stringify(classes);
  useEffect(() => {
    const el = document.documentElement;
    const entries = Object.entries(JSON.parse(key) as Record<string, boolean>);
    entries.forEach(([c, on]) => el.classList.toggle(c, on));
    return () => entries.forEach(([c]) => el.classList.remove(c));
  }, [key]);
}

function OfflineBar() {
  const online = useOnline();
  if (online) return null;
  return (
    <div className="offline-bar" role="status">
      <WifiOff aria-hidden /> Tidak ada koneksi. Kontak bantuan yang tersimpan tetap bisa dibuka.
    </div>
  );
}

function SkipLink() {
  return (
    <a href="#main" className="skip-link">
      Lompat ke isi
    </a>
  );
}

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  code?: string;
  end?: boolean;
}

/* ── Siswa (ponsel lebih dulu; sidebar di desktop) ─────────────────────── */
export function HelpButton({ child }: { child?: boolean }) {
  return (
    <Link to="/siswa/bantuan" className="help-btn">
      <HandHeart aria-hidden />
      {child ? "Aku butuh bantuan" : "Butuh bantuan sekarang"}
    </Link>
  );
}

export function StudentShell() {
  const { user, logout } = useAuth();
  const child = user?.ui_mode === "anak";
  useRootClasses({ "mode-anak": child, hc: !!user?.high_contrast });
  useEffect(() => {
    refreshContacts();
  }, []);
  const nav: NavItem[] = child
    ? [
        { to: "/siswa", label: "Beranda", icon: <House aria-hidden />, end: true },
        { to: "/siswa/pustaka", label: "Bacaan", icon: <BookOpen aria-hidden /> },
        { to: "/siswa/privasi", label: "Dataku", icon: <KeyRound aria-hidden /> },
      ]
    : [
        { to: "/siswa", label: "Beranda", icon: <House aria-hidden />, end: true },
        { to: "/siswa/checkin", label: "Check-in", icon: <ClipboardCheck aria-hidden /> },
        { to: "/siswa/pustaka", label: "Pustaka", icon: <BookOpen aria-hidden /> },
        { to: "/siswa/privasi", label: "Privasi", icon: <KeyRound aria-hidden /> },
      ];
  return (
    <div className={`app student-shell has-sidebar`}>
      <SkipLink />
      <aside className="sidebar" aria-label="Navigasi">
        <div className="sb-head">
          <Wordmark to="/siswa" />
          <span className="sb-role">{child ? "Ruang anak" : ROLE_LABEL.siswa}</span>
        </div>
        <nav>
          {nav.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className="sb-link">
              {n.icon}
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="sb-foot">
          <HelpButton child={child} />
          <UserFoot onLogout={logout} />
        </div>
      </aside>
      <div className="main-area">
        <OfflineBar />
        <header className="m-top">
          <Wordmark small to="/siswa" />
          <button type="button" className="btn btn-quiet btn-sm" onClick={logout}>
            <LogOut aria-hidden /> Keluar
          </button>
        </header>
        <main id="main" className="m-page" tabIndex={-1}>
          <Outlet />
        </main>
        <div className="help-dock">
          <div className="help-inner">
            <HelpButton child={child} />
          </div>
        </div>
        <nav className="bottom-nav" aria-label="Navigasi utama">
          {nav.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}>
              {n.icon}
              {n.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}

/* ── Wali (ponsel) ─────────────────────────────────────────────────────── */
export function GuardianShell() {
  const { logout } = useAuth();
  const loc = useLocation();
  const q = loc.search;
  const nav: NavItem[] = [
    { to: "/wali", label: "Ringkasan", icon: <House aria-hidden />, end: true },
    { to: "/wali/persetujuan", label: "Persetujuan", icon: <ShieldCheck aria-hidden /> },
    { to: "/wali/hak-data", label: "Hak data", icon: <KeyRound aria-hidden /> },
  ];
  return (
    <div className="app student-shell has-sidebar guardian-shell">
      <SkipLink />
      <aside className="sidebar" aria-label="Navigasi">
        <div className="sb-head">
          <Wordmark to="/wali" />
          <span className="sb-role">{ROLE_LABEL.wali}</span>
        </div>
        <nav>
          {nav.map((n) => (
            <NavLink key={n.to} to={n.to + q} end={n.end} className="sb-link">
              {n.icon}
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="sb-foot">
          <UserFoot onLogout={logout} />
        </div>
      </aside>
      <div className="main-area">
        <OfflineBar />
        <header className="m-top">
          <Wordmark small to="/wali" />
          <button type="button" className="btn btn-quiet btn-sm" onClick={logout}>
            <LogOut aria-hidden /> Keluar
          </button>
        </header>
        <main id="main" className="m-page guardian-page" tabIndex={-1}>
          <Outlet />
        </main>
        <nav className="bottom-nav" aria-label="Navigasi utama">
          {nav.map((n) => (
            <NavLink key={n.to} to={n.to + q} end={n.end}>
              {n.icon}
              {n.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}

/* ── Staf (desktop lebih dulu; laci di bawah 1024 px) ──────────────────── */
const STAFF_NAV: Partial<Record<Role, { group?: string; items: NavItem[] }[]>> = {
  guru: [
    {
      items: [
        { to: "/guru", label: "Daftar sapaan", icon: <MessageSquareText aria-hidden />, code: "G1", end: true },
        { to: "/guru/panduan", label: "Panduan menyapa", icon: <HeartHandshake aria-hidden />, code: "G3" },
      ],
    },
  ],
  bk: [
    {
      items: [
        { to: "/bk", label: "Antrean kasus", icon: <Inbox aria-hidden />, code: "K1", end: true },
        { to: "/bk/protokol", label: "Protokol krisis", icon: <LifeBuoy aria-hidden />, code: "K3" },
        { to: "/bk/beban", label: "Beban layanan", icon: <Gauge aria-hidden />, code: "K4" },
        { to: "/bk/keberatan", label: "Keberatan siswa", icon: <Gavel aria-hidden />, code: "E3" },
      ],
    },
  ],
  admin: [
    {
      group: "Data",
      items: [
        { to: "/admin", label: "Impor data", icon: <FileUp aria-hidden />, code: "A1", end: true },
        { to: "/admin/pengguna", label: "Pengguna dan relasi", icon: <Users aria-hidden />, code: "A2" },
      ],
    },
    {
      group: "Sistem",
      items: [
        { to: "/admin/aturan", label: "Aturan dan ambang", icon: <SlidersHorizontal aria-hidden />, code: "A3" },
        { to: "/admin/sumber-daya", label: "Kontak dan pustaka", icon: <Phone aria-hidden />, code: "A4" },
        { to: "/admin/log", label: "Log teknis", icon: <ScrollText aria-hidden />, code: "E1" },
      ],
    },
  ],
  pimpinan: [{ items: [{ to: "/pimpinan", label: "Dasbor agregat", icon: <ChartColumn aria-hidden />, code: "P1", end: true }] }],
  komite: [
    {
      group: "Pengawasan",
      items: [
        { to: "/komite", label: "Log audit", icon: <ScrollText aria-hidden />, code: "E1", end: true },
        { to: "/komite/keadilan", label: "Keadilan", icon: <Scale aria-hidden />, code: "E2" },
        { to: "/komite/keberatan", label: "Hak data dan keberatan", icon: <Gavel aria-hidden />, code: "E3" },
        { to: "/komite/aturan", label: "Registri aturan dan XAI", icon: <ListChecks aria-hidden />, code: "E4" },
      ],
    },
    { group: "Agregat", items: [{ to: "/komite/agregat", label: "Dasbor agregat", icon: <ChartColumn aria-hidden />, code: "P1" }] },
  ],
};

function UserFoot({ onLogout }: { onLogout: () => void }) {
  const { user } = useAuth();
  if (!user) return null;
  const label = user.title ?? user.nickname;
  return (
    <div className="sb-user">
      <span className="avatar" aria-hidden>
        {initials(user.title ?? user.name)}
      </span>
      <span className="who">
        <strong>{label}</strong>
        <span className="caption">{user.institution?.name}</span>
      </span>
      <button type="button" className="icon-btn" onClick={onLogout} aria-label="Keluar">
        <LogOut aria-hidden style={{ width: 20, height: 20 }} />
      </button>
    </div>
  );
}

export function StaffShell() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const nav = useNavigate();
  useEffect(() => setOpen(false), [loc.pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  if (!user) return null;
  const groups = STAFF_NAV[user.role] ?? [];
  const doLogout = () => {
    logout();
    nav("/masuk");
  };
  return (
    <div className={`app has-sidebar ${open ? "drawer-open" : ""}`}>
      <SkipLink />
      <aside className="sidebar" id="staff-nav" aria-label="Navigasi">
        <div className="sb-head">
          <div className="row between nowrap-row">
            <Wordmark />
            <button type="button" className="icon-btn staff-close" onClick={() => setOpen(false)} aria-label="Tutup menu" style={{ display: open ? undefined : "none" }}>
              <X aria-hidden />
            </button>
          </div>
          <span className="sb-role">
            {ROLE_LABEL[user.role]}
            {user.is_coordinator ? " · koordinator" : ""}
          </span>
        </div>
        <nav>
          {groups.map((g, i) => (
            <div className="sb-group" key={i}>
              {g.group && <div className="sb-group-label">{g.group}</div>}
              {g.items.map((n) => (
                <NavLink key={n.to} to={n.to} end={n.end} className="sb-link">
                  {n.icon}
                  {n.label}
                  {n.code && <span className="sb-code">{n.code}</span>}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="sb-foot">
          {user.environment !== "production" && (
            <div className="sim-box">
              <strong>SIMULASI</strong>
              Semua nama, kode, dan angka di layar ini fiktif.
            </div>
          )}
          <UserFoot onLogout={doLogout} />
        </div>
      </aside>
      {open && <div className="backdrop" onClick={() => setOpen(false)} aria-hidden />}
      <div className="main-area">
        <header className="topbar staff-top">
          <button type="button" className="icon-btn" onClick={() => setOpen(true)} aria-label="Buka menu" aria-expanded={open} aria-controls="staff-nav">
            <Menu aria-hidden />
          </button>
          <Wordmark small />
        </header>
        <main id="main" className="page" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
