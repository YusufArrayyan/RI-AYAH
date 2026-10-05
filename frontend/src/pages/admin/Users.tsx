import { Search, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { Banner, Button, ConfirmDialog, ErrorState, LoadingBlock, PageHead, SimTag, XaiBox } from "../../components/ui";
import { api, useResource } from "../../lib/api";
import { useToast } from "../../lib/toast";

interface U {
  id: number;
  name: string;
  email: string;
  role: string;
  role_name: string;
  scope: string;
  status: "aktif" | "nonaktif" | "menunggu" | "menunggu_akun";
}
interface Rel {
  id: number;
  actor: string;
  actor_role: string;
  student: string;
  student_class: string;
  kind: string;
  status: string;
  proposed_by: string | null;
  proposed_by_id: number | null;
}
const ROLES = [
  ["", "Semua"],
  ["siswa", "Siswa"],
  ["wali", "Wali"],
  ["guru", "Guru"],
  ["bk", "Guru BK"],
  ["admin", "Admin"],
  ["pimpinan", "Pimpinan"],
  ["komite", "Komite"],
] as const;
const KIND_LABEL: Record<string, string> = { wali_kelas: "Wali kelas", dosen_pa: "Dosen PA", bk: "Guru BK", wali: "Orang tua/wali" };
const STATUS: Record<string, [string, string]> = {
  aktif: ["Aktif", "chip-ok"],
  nonaktif: ["Nonaktif", "chip-neutral"],
  menunggu: ["Relasi menunggu", "chip-warn"],
  menunggu_akun: ["Menunggu persetujuan", "chip-warn"],
  menunggu_verifikasi: ["Menunggu verifikasi", "chip-warn"],
  menunggu_persetujuan: ["Menunggu persetujuan 4 mata", "chip-warn"],
};

/** A2 Pengguna dan relasi. */
export default function UsersPage() {
  const [role, setRole] = useState("");
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDq(q), 250);
    return () => clearTimeout(t);
  }, [q]);
  const users = useResource<{ users: U[]; counts: Record<string, number>; pending_accounts: number }>(`/api/admin/users?role=${role}&q=${encodeURIComponent(dq)}`);
  const rels = useResource<{ relations: Rel[]; me: number }>("/api/admin/relations");
  const students = useResource<{ users: U[] }>("/api/admin/users?role=siswa");
  const staff = useResource<{ users: U[] }>("/api/admin/users");
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [deact, setDeact] = useState<U | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newU, setNewU] = useState({ name: "", email: "", role: "guru", class_name: "" });
  const [rel, setRel] = useState({ actor_id: "", student_id: "", kind: "wali_kelas" });
  const [temp, setTemp] = useState<{ email: string; password: string } | null>(null);
  const [onlyPending, setOnlyPending] = useState(false);

  const pending = (rels.data?.relations ?? []).filter((r) => r.status.startsWith("menunggu"));
  const actorRole = { wali_kelas: "guru", dosen_pa: "guru", bk: "bk", wali: "wali" }[rel.kind];
  const actors = (staff.data?.users ?? []).filter((u) => u.role === actorRole);

  const approve = async (id: number) => {
    setBusy(`a${id}`);
    setErr(null);
    try {
      await api(`/api/admin/relations/${id}/approve`, { method: "POST" });
      toast("Relasi disetujui dan tercatat di log audit.");
      rels.reload();
      users.reload();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const propose = async () => {
    setBusy("rel");
    setErr(null);
    try {
      await api("/api/admin/relations", { method: "POST", json: { actor_id: Number(rel.actor_id), student_id: Number(rel.student_id), kind: rel.kind } });
      toast("Usulan relasi dibuat. Menunggu persetujuan orang kedua.");
      setRel({ actor_id: "", student_id: "", kind: rel.kind });
      rels.reload();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const addUser = async () => {
    setBusy("add");
    setErr(null);
    try {
      const r = await api<{ temp_password: string }>("/api/admin/users", { method: "POST", json: { ...newU, class_name: newU.class_name || null } });
      setTemp({ email: newU.email, password: r.temp_password });
      toast("Pengguna ditambahkan.");
      setAddOpen(false);
      setNewU({ name: "", email: "", role: "guru", class_name: "" });
      users.reload();
      staff.reload();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const deactivate = async () => {
    if (!deact) return;
    setBusy("deact");
    try {
      const activate = deact.status === "nonaktif" || deact.status === "menunggu_akun";
      await api(`/api/admin/users/${deact.id}`, { method: "PATCH", json: { active: activate } });
      toast(deact.status === "menunggu_akun" ? "Akun disetujui. Pengguna sekarang bisa masuk." : activate ? "Pengguna diaktifkan." : "Pengguna dinonaktifkan.");
      setDeact(null);
      users.reload();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHead
        title="Pengguna dan relasi"
        meta={<SimTag />}
        sub="Relasi menentukan siapa boleh melihat siapa. Setiap perubahan relasi perlu persetujuan orang kedua dan tercatat di log audit."
        actions={
          <Button icon={<UserPlus aria-hidden />} onClick={() => setAddOpen(true)}>
            Tambah pengguna
          </Button>
        }
      />
      {err && <Banner kind="bad">{err}</Banner>}
      <div className="stack" style={{ gap: 20 }}>
        {(users.data?.pending_accounts ?? 0) > 0 && (
          <Banner
            kind="warn"
            action={
              <Button size="sm" variant="ghost" onClick={() => setOnlyPending((v) => !v)}>
                {onlyPending ? "Tampilkan semua" : "Lihat"}
              </Button>
            }
          >
            <strong>{users.data?.pending_accounts} akun baru</strong> menunggu persetujuan. Periksa peran dan email sebelum menyetujui.
          </Banner>
        )}
        {pending.length > 0 && (
          <section className="card stack" aria-labelledby="pend">
            <h2 id="pend">Menunggu persetujuan ({pending.length})</h2>
            <ul className="list">
              {pending.map((r) => {
                const own = r.proposed_by_id === rels.data?.me;
                return (
                  <li key={r.id} className="row between">
                    <span>
                      <span className="strong">
                        {KIND_LABEL[r.kind]}: {r.actor} → {r.student}
                      </span>
                      <span className="caption" style={{ display: "block" }}>
                        {r.student_class} · {r.proposed_by ? `diusulkan ${r.proposed_by}` : "dari pendaftaran wali"}
                      </span>
                    </span>
                    {own ? (
                      <span className="chip chip-neutral">Usulan Anda; perlu orang lain</span>
                    ) : (
                      <Button size="sm" onClick={() => approve(r.id)} loading={busy === `a${r.id}`}>
                        Setujui
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <div className="layout-2col">
          <section className="card flush" aria-labelledby="daftar">
            <div className="stack" style={{ padding: 16, gap: 12 }}>
              <h2 id="daftar">Pengguna</h2>
              <div className="filter-chips" role="group" aria-label="Filter peran">
                {ROLES.map(([k, l]) => (
                  <button key={k} type="button" className="filter-chip" aria-pressed={role === k} onClick={() => setRole(k)}>
                    {l}
                    {k && users.data?.counts[k] ? ` · ${users.data.counts[k]}` : ""}
                  </button>
                ))}
              </div>
              <div className="search">
                <Search aria-hidden />
                <label className="sr-only" htmlFor="uq">
                  Cari nama
                </label>
                <input id="uq" className="input" type="search" name="q" autoComplete="off" placeholder="Cari nama…" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
            </div>
            {users.loading && !users.data && (
              <div style={{ padding: 16 }}>
                <LoadingBlock lines={2} />
              </div>
            )}
            {users.error && <ErrorState error={users.error} onRetry={users.reload} />}
            {users.data && (
              <div className="table-wrap" style={{ maxHeight: 560, overflowY: "auto" }}>
                <table className="table stack-mobile">
                  <caption className="sr-only">Daftar pengguna</caption>
                  <thead>
                    <tr>
                      <th scope="col">Nama</th>
                      <th scope="col">Peran</th>
                      <th scope="col">Cakupan</th>
                      <th scope="col">Status</th>
                      <th scope="col">
                        <span className="sr-only">Aksi</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.data.users.filter((u) => !onlyPending || u.status === "menunggu_akun").map((u) => (
                      <tr key={u.id}>
                        <td data-label="Nama" className="cell-main">
                          {u.name}
                          <span className="caption" style={{ display: "block", fontWeight: 400 }}>
                            {u.email}
                          </span>
                        </td>
                        <td data-label="Peran">{u.role_name}</td>
                        <td data-label="Cakupan" className="small">
                          {u.scope || "-"}
                        </td>
                        <td data-label="Status">
                          <span className={`chip ${STATUS[u.status][1]}`}>{STATUS[u.status][0]}</span>
                        </td>
                        <td className="actions">
                          <Button size="sm" variant={u.status === "menunggu_akun" ? "primary" : u.status === "nonaktif" ? "ghost" : "quiet"} onClick={() => setDeact(u)}>
                            {u.status === "menunggu_akun" ? "Setujui" : u.status === "nonaktif" ? "Aktifkan" : "Nonaktifkan"}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <aside className="stack sticky-col">
            <section className="card stack" aria-labelledby="usul">
              <h2 id="usul">Usulkan relasi</h2>
              <div className="field">
                <label className="label" htmlFor="rk">
                  Jenis
                </label>
                <select id="rk" className="select" value={rel.kind} onChange={(e) => setRel({ actor_id: "", student_id: rel.student_id, kind: e.target.value })}>
                  {Object.entries(KIND_LABEL).map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label className="label" htmlFor="ra">
                  {KIND_LABEL[rel.kind]}
                </label>
                <select id="ra" className="select" value={rel.actor_id} onChange={(e) => setRel({ ...rel, actor_id: e.target.value })}>
                  <option value="">Pilih</option>
                  {actors.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label className="label" htmlFor="rs">
                  Siswa
                </label>
                <select id="rs" className="select" value={rel.student_id} onChange={(e) => setRel({ ...rel, student_id: e.target.value })}>
                  <option value="">Pilih</option>
                  {(students.data?.users ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} · {s.scope}
                    </option>
                  ))}
                </select>
              </div>
              <Button onClick={propose} loading={busy === "rel"} disabled={!rel.actor_id || !rel.student_id}>
                Ajukan
              </Button>
            </section>
            <XaiBox title="Siapa melihat apa" tag="Lapis 3">
              <ul>
                <li>Wali kelas: kuning siswa kelas binaan, tanpa skor.</li>
                <li>Guru BK: kasus yang ditugaskan; koordinator semua.</li>
                <li>Orang tua: status persetujuan dan undangan BK anaknya.</li>
                <li>Admin: konfigurasi; tidak membaca check-in atau catatan.</li>
              </ul>
            </XaiBox>
          </aside>
        </div>
      </div>

      <ConfirmDialog
        open={!!deact}
        title={deact?.status === "menunggu_akun" ? "Setujui akun baru?" : deact?.status === "nonaktif" ? "Aktifkan pengguna?" : "Nonaktifkan pengguna?"}
        consequence={
          deact?.status === "menunggu_akun"
            ? `${deact?.name} (${deact?.role_name}, ${deact?.email}) akan bisa masuk. Untuk guru, tambahkan relasi kelas binaan agar daftar sapaannya terisi.`
            : deact?.status === "nonaktif"
              ? `${deact?.name} dapat masuk kembali.`
              : `${deact?.name} tidak dapat masuk lagi. Relasi dan riwayatnya tetap tercatat.`
        }
        confirmLabel={deact?.status === "menunggu_akun" ? "Setujui" : deact?.status === "nonaktif" ? "Aktifkan" : "Nonaktifkan"}
        danger={deact?.status === "aktif" || deact?.status === "menunggu"}
        loading={busy === "deact"}
        onConfirm={deactivate}
        onCancel={() => setDeact(null)}
      />
      <ConfirmDialog
        open={!!temp}
        title="Akun dibuat"
        consequence="Berikan kata sandi sementara ini kepada pengguna secara langsung. Kata sandi hanya ditampilkan sekali."
        confirmLabel="Selesai"
        cancelLabel="Salin"
        onConfirm={() => setTemp(null)}
        onCancel={() => {
          if (temp) navigator.clipboard?.writeText(temp.password).then(() => toast("Kata sandi disalin."), () => {});
        }}
      >
        <dl className="dl">
          <dt>Email</dt>
          <dd>{temp?.email}</dd>
          <dt>Kata sandi</dt>
          <dd className="mono" translate="no">
            {temp?.password}
          </dd>
        </dl>
      </ConfirmDialog>
      <ConfirmDialog open={addOpen} title="Tambah pengguna" consequence="Sistem membuat kata sandi sementara yang ditampilkan sekali. Di sekolah, pengguna masuk memakai SSO." confirmLabel="Tambah" loading={busy === "add"} onConfirm={addUser} onCancel={() => setAddOpen(false)}>
        <div className="field">
          <label className="label" htmlFor="nn">
            Nama lengkap
          </label>
          <input id="nn" name="name" className="input" autoComplete="off" value={newU.name} onChange={(e) => setNewU({ ...newU, name: e.target.value })} />
        </div>
        <div className="field">
          <label className="label" htmlFor="ne">
            Email sekolah
          </label>
          <input id="ne" name="email" className="input" type="email" autoComplete="off" spellCheck={false} value={newU.email} onChange={(e) => setNewU({ ...newU, email: e.target.value })} />
        </div>
        <div className="field">
          <label className="label" htmlFor="nr">
            Peran
          </label>
          <select id="nr" className="select" value={newU.role} onChange={(e) => setNewU({ ...newU, role: e.target.value })}>
            {ROLES.filter(([k]) => k).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </div>
      </ConfirmDialog>
    </>
  );
}
