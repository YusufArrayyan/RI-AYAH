import { lazy, Suspense, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { LoadingBlock } from "./components/ui";
import { GuardianShell, StaffShell, StudentShell } from "./layouts/Shells";
import { AuthProvider, ROLE_HOME, useAuth, type Role } from "./lib/auth";
import { ToastProvider } from "./lib/toast";
import Login from "./pages/Login";
import Register from "./pages/Register";
import { AcceptInvite, Activate } from "./pages/Activate";
import About from "./pages/About";

// Siswa
const StudentHome = lazy(() => import("./pages/student/Home"));
const Consent = lazy(() => import("./pages/student/Consent"));
const WhyFlagged = lazy(() => import("./pages/student/WhyFlagged"));
const Checkin = lazy(() => import("./pages/student/Checkin"));
const Library = lazy(() => import("./pages/student/Library"));
const LibraryItem = lazy(() => import("./pages/student/LibraryItem"));
const Privacy = lazy(() => import("./pages/student/Privacy"));
const HelpNow = lazy(() => import("./pages/student/HelpNow"));
const StudentStories = lazy(() => import("./pages/student/Stories"));
const CounselorStories = lazy(() => import("./pages/counselor/Stories"));
const Codes = lazy(() => import("./pages/admin/Codes"));
// Wali
const GuardianSummary = lazy(() => import("./pages/guardian/Summary"));
const GuardianConsent = lazy(() => import("./pages/guardian/Consent"));
const GuardianRights = lazy(() => import("./pages/guardian/Rights"));
// Guru
const TeacherList = lazy(() => import("./pages/teacher/CaseList"));
const TeacherCase = lazy(() => import("./pages/teacher/CaseDetail"));
const TeacherGuide = lazy(() => import("./pages/teacher/Guide"));
// BK
const CounselorQueue = lazy(() => import("./pages/counselor/Queue"));
const CounselorCase = lazy(() => import("./pages/counselor/CaseDetail"));
const Protocol = lazy(() => import("./pages/counselor/Protocol"));
const Load = lazy(() => import("./pages/counselor/Load"));
// Admin
const Import = lazy(() => import("./pages/admin/Import"));
const UsersPage = lazy(() => import("./pages/admin/Users"));
const Rules = lazy(() => import("./pages/admin/Rules"));
const Resources = lazy(() => import("./pages/admin/Resources"));
// Pimpinan dan komite
const Aggregate = lazy(() => import("./pages/leader/Aggregate"));
const AuditLog = lazy(() => import("./pages/ethics/AuditLog"));
const Fairness = lazy(() => import("./pages/ethics/Fairness"));
const Objections = lazy(() => import("./pages/ethics/Objections"));
const Registry = lazy(() => import("./pages/ethics/Registry"));

function Guard({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user, ready } = useAuth();
  if (!ready)
    return (
      <div className="page">
        <LoadingBlock />
      </div>
    );
  if (!user) return <Navigate to="/masuk" replace />;
  if (!roles.includes(user.role)) return <Navigate to={ROLE_HOME[user.role]} replace />;
  return <>{children}</>;
}

function Home() {
  const { user, ready } = useAuth();
  if (!ready) return null;
  return <Navigate to={user ? ROLE_HOME[user.role] : "/masuk"} replace />;
}

const fallback = <LoadingBlock />;
const S = (el: ReactNode) => <Suspense fallback={fallback}>{el}</Suspense>;

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/masuk" element={<Login />} />
            <Route path="/daftar" element={<Register />} />
            <Route path="/aktivasi" element={<Activate />} />
            <Route path="/undangan" element={<AcceptInvite />} />
            <Route path="/tentang" element={<About />} />

            <Route
              path="/siswa"
              element={
                <Guard roles={["siswa"]}>
                  <StudentShell />
                </Guard>
              }
            >
              <Route index element={S(<StudentHome />)} />
              <Route path="persetujuan" element={S(<Consent />)} />
              <Route path="alasan" element={S(<WhyFlagged />)} />
              <Route path="checkin" element={S(<Checkin />)} />
              <Route path="pustaka" element={S(<Library />)} />
              <Route path="pustaka/:id" element={S(<LibraryItem />)} />
              <Route path="privasi" element={S(<Privacy />)} />
              <Route path="bantuan" element={S(<HelpNow />)} />
              <Route path="cerita" element={S(<StudentStories />)} />
            </Route>

            <Route
              path="/wali"
              element={
                <Guard roles={["wali"]}>
                  <GuardianShell />
                </Guard>
              }
            >
              <Route index element={S(<GuardianSummary />)} />
              <Route path="persetujuan" element={S(<GuardianConsent />)} />
              <Route path="hak-data" element={S(<GuardianRights />)} />
            </Route>

            <Route
              element={
                <Guard roles={["guru", "bk", "admin", "pimpinan", "komite"]}>
                  <StaffShell />
                </Guard>
              }
            >
              <Route path="/guru" element={<Guard roles={["guru"]}>{S(<TeacherList />)}</Guard>} />
              <Route path="/guru/kasus/:id" element={<Guard roles={["guru"]}>{S(<TeacherCase />)}</Guard>} />
              <Route path="/guru/panduan" element={<Guard roles={["guru"]}>{S(<TeacherGuide />)}</Guard>} />

              <Route path="/bk" element={<Guard roles={["bk"]}>{S(<CounselorQueue />)}</Guard>} />
              <Route path="/bk/kasus/:id" element={<Guard roles={["bk"]}>{S(<CounselorCase />)}</Guard>} />
              <Route path="/bk/protokol" element={<Guard roles={["bk"]}>{S(<Protocol />)}</Guard>} />
              <Route path="/bk/beban" element={<Guard roles={["bk"]}>{S(<Load />)}</Guard>} />
              <Route path="/bk/keberatan" element={<Guard roles={["bk"]}>{S(<Objections />)}</Guard>} />
              <Route path="/bk/cerita" element={<Guard roles={["bk"]}>{S(<CounselorStories />)}</Guard>} />

              <Route path="/admin" element={<Guard roles={["admin"]}>{S(<Import />)}</Guard>} />
              <Route path="/admin/pengguna" element={<Guard roles={["admin"]}>{S(<UsersPage />)}</Guard>} />
              <Route path="/admin/kode" element={<Guard roles={["admin"]}>{S(<Codes />)}</Guard>} />
              <Route path="/admin/aturan" element={<Guard roles={["admin"]}>{S(<Rules />)}</Guard>} />
              <Route path="/admin/sumber-daya" element={<Guard roles={["admin"]}>{S(<Resources />)}</Guard>} />
              <Route path="/admin/log" element={<Guard roles={["admin"]}>{S(<AuditLog />)}</Guard>} />

              <Route path="/pimpinan" element={<Guard roles={["pimpinan"]}>{S(<Aggregate />)}</Guard>} />

              <Route path="/komite" element={<Guard roles={["komite"]}>{S(<AuditLog />)}</Guard>} />
              <Route path="/komite/keadilan" element={<Guard roles={["komite"]}>{S(<Fairness />)}</Guard>} />
              <Route path="/komite/keberatan" element={<Guard roles={["komite"]}>{S(<Objections />)}</Guard>} />
              <Route path="/komite/aturan" element={<Guard roles={["komite"]}>{S(<Registry />)}</Guard>} />
              <Route path="/komite/agregat" element={<Guard roles={["komite"]}>{S(<Aggregate />)}</Guard>} />
            </Route>

            <Route path="*" element={<Home />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}
