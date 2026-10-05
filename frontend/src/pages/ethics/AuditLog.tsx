import { Download, Link2, Search, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Banner, Button, EmptyState, ErrorState, LoadingBlock, PageHead, SimTag, XaiBox } from "../../components/ui";
import { api, download, useResource } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { fmtDateTime } from "../../lib/format";

interface LogRow {
  id: number;
  at: string;
  actor: string;
  role: string;
  action: string;
  object: string;
  detail: string | null;
  hash: string;
  prev_hash: string;
}
const ROLE_NAMES: Record<string, string> = { siswa: "Siswa", wali: "Wali", guru: "Guru", bk: "Guru BK", admin: "Admin", pimpinan: "Pimpinan", komite: "Komite", sistem: "Sistem" };

/** E1 Log audit (komite: semua; admin: hanya log teknis). */
export default function AuditLog() {
  const { user } = useAuth();
  const committee = user?.role === "komite";
  const [role, setRole] = useState("");
  const [action, setAction] = useState("");
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDq(q), 250);
    return () => clearTimeout(t);
  }, [q]);
  const { data, error, loading, reload } = useResource<{ rows: LogRow[]; actions: string[] }>(`/api/ethics/audit?actor=${role}&action=${action}&q=${encodeURIComponent(dq)}&limit=150`);
  const [verify, setVerify] = useState<null | { ok: boolean; checked: number; broken_ids: number[] }>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const doVerify = async () => {
    setBusy("v");
    setErr(null);
    try {
      setVerify(await api("/api/ethics/audit/verify"));
      reload();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHead
        title={committee ? "Log audit" : "Log teknis"}
        meta={<SimTag />}
        sub={committee ? "Setiap akses ke data sensitif dan setiap perubahan tercatat, hanya dapat ditambah, dan dirantai dengan hash." : "Admin melihat log teknis (masuk, impor). Akses ke data siswa hanya terlihat oleh komite."}
        actions={
          committee && (
            <>
              <Button variant="xai" icon={<ShieldCheck aria-hidden />} onClick={doVerify} loading={busy === "v"}>
                Verifikasi rantai
              </Button>
              <Button
                variant="ghost"
                icon={<Download aria-hidden />}
                loading={busy === "e"}
                onClick={async () => {
                  setBusy("e");
                  try {
                    await download("/api/ethics/audit/export", "log-audit-riayah.csv");
                  } catch (e) {
                    setErr((e as Error).message);
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                Ekspor
              </Button>
            </>
          )
        }
      />
      <div className="stack" style={{ gap: 16 }}>
        {verify && (
          <Banner kind={verify.ok ? "xai" : "bad"}>
            {verify.ok ? (
              <>
                <strong>Rantai utuh.</strong> {verify.checked} entri dihitung ulang dan cocok.
              </>
            ) : (
              <>
                <strong>Rantai rusak</strong> di entri #{verify.broken_ids.join(", #")}. Komite telah diberi peringatan; telusuri perubahan pada entri tersebut.
              </>
            )}
          </Banner>
        )}
        {err && <Banner kind="bad">{err}</Banner>}
        <div className="layout-2col">
          <section className="card flush" aria-label="Entri log">
            <div className="row" style={{ padding: 16, gap: 10 }}>
              <div className="search grow" style={{ minWidth: 200 }}>
                <Search aria-hidden />
                <label htmlFor="lq" className="sr-only">
                  Cari
                </label>
                <input id="lq" className="input" type="search" name="q" autoComplete="off" placeholder="Cari aktor, objek, keterangan…" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              {committee && (
                <>
                  <label className="sr-only" htmlFor="lr">
                    Peran
                  </label>
                  <select id="lr" className="select" style={{ width: "auto" }} value={role} onChange={(e) => setRole(e.target.value)}>
                    <option value="">Semua peran</option>
                    {Object.entries(ROLE_NAMES).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                  <label className="sr-only" htmlFor="la">
                    Aksi
                  </label>
                  <select id="la" className="select" style={{ width: "auto" }} value={action} onChange={(e) => setAction(e.target.value)}>
                    <option value="">Semua aksi</option>
                    {(data?.actions ?? []).map((a) => (
                      <option key={a} value={a}>
                        {a.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                </>
              )}
            </div>
            {loading && !data && (
              <div style={{ padding: 16 }}>
                <LoadingBlock lines={3} />
              </div>
            )}
            {error && !data && <ErrorState error={error} onRetry={reload} />}
            {data && data.rows.length === 0 && <EmptyState title="Tidak ada entri yang cocok">Ubah filter atau kata kunci.</EmptyState>}
            {data && data.rows.length > 0 && (
              <div className="table-wrap" style={{ maxHeight: 640, overflowY: "auto" }}>
                <table className="table stack-mobile">
                  <caption className="sr-only">Entri log audit</caption>
                  <thead>
                    <tr>
                      <th scope="col">Waktu</th>
                      <th scope="col">Aktor</th>
                      <th scope="col">Aksi</th>
                      <th scope="col">Objek</th>
                      <th scope="col">Hash</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((r) => (
                      <tr key={r.id} className={verify && verify.broken_ids.includes(r.id) ? "row-bad" : ""}>
                        <td data-label="Waktu" className="nowrap small">
                          {fmtDateTime(r.at)}
                        </td>
                        <td data-label="Aktor">
                          <span className="strong">{r.actor}</span>
                          <span className="caption" style={{ display: "block" }}>
                            {ROLE_NAMES[r.role] ?? r.role}
                          </span>
                        </td>
                        <td data-label="Aksi">
                          {r.action.replace(/_/g, " ")}
                          {r.detail && <span className="caption" style={{ display: "block" }}>{r.detail}</span>}
                        </td>
                        <td data-label="Objek" className="small">
                          {r.object}
                        </td>
                        <td data-label="Hash" className="mono caption" title={`${r.hash}\nsebelumnya: ${r.prev_hash}`}>
                          {r.hash.slice(0, 10)}…
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <aside className="stack sticky-col">
            <XaiBox title="Cara kerja rantai hash" tag="XAI-5">
              <p>Setiap entri menyimpan hash entri sebelumnya. Bila satu entri diubah diam-diam, hash berikutnya tidak lagi cocok dan verifikasi menandainya.</p>
              <div className="row nowrap-row mono caption" style={{ gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                <span className="chip chip-neutral">#n−1</span>
                <Link2 aria-hidden style={{ width: 14, height: 14 }} />
                <span className="chip chip-neutral">#n = sha256(hash n−1 + isi)</span>
              </div>
            </XaiBox>
            <section className="card stack" style={{ gap: 6 }}>
              <h2 style={{ fontSize: 16 }}>Yang dicatat</h2>
              <p className="small">Membuka kasus, membaca check-in, menulis catatan, mengubah persetujuan, aturan, relasi, kontak, dan impor. Isi check-in dan catatan tidak pernah masuk ke log.</p>
            </section>
          </aside>
        </div>
      </div>
    </>
  );
}
