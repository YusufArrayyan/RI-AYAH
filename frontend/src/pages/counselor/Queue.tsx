import { Inbox, UserCheck } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Banner, Button, EmptyState, ErrorState, LoadingBlock, PageHead, SimTag, Stat, StatusChip, Tabs, ZoneChip } from "../../components/ui";
import { api, useResource } from "../../lib/api";
import { fmtRemaining, fmtNum } from "../../lib/format";
import { useToast } from "../../lib/toast";
import { useQueryState } from "../../lib/useQueryState";

interface Row {
  id: number;
  code: string;
  class_name: string;
  zone: string;
  rule: string;
  rule_id: string;
  owner: string;
  mine: boolean;
  unassigned: boolean;
  status: string;
  escalated: boolean;
  hours_left: number;
  overdue: boolean;
}
interface QueueData {
  stats: { red_open: number; yellow_open: number; overdue: number; red_median_hours: number | null };
  rows: Row[];
  counselors: { id: number; title: string; active: number }[];
  is_coordinator: boolean;
}

/** K1 Antrean kasus. */
export default function Queue() {
  const [tab, setTab] = useQueryState<"merah" | "kuning" | "selesai">("tab", "merah");
  const { data, error, loading, reload } = useResource<QueueData>(`/api/counselor/cases?tab=${tab}`);
  const toast = useToast();
  const [busy, setBusy] = useState<number | null>(null);

  const take = async (id: number) => {
    setBusy(id);
    try {
      await api(`/api/counselor/cases/${id}/take`, { method: "POST" });
      toast("Kasus kini Anda tangani.");
      reload();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHead title="Antrean kasus" meta={<SimTag />} sub="Kasus merah, kuning yang diteruskan, dan kasus yang lewat batas. Tangani merah lebih dulu." />
      {loading && !data && <LoadingBlock />}
      {error && !data && <ErrorState error={error} onRetry={reload} />}
      {data && (
        <div className="stack" style={{ gap: 20 }}>
          <div className="stat-strip">
            <Stat value={data.stats.red_open} label="Merah terbuka" tone={data.stats.red_open ? "bad" : undefined} />
            <Stat value={data.stats.yellow_open} label="Kuning di BK" />
            <Stat value={data.stats.overdue} label="Lewat batas" tone={data.stats.overdue ? "bad" : undefined} />
            <Stat value={data.stats.red_median_hours !== null ? `${fmtNum(data.stats.red_median_hours)} jam` : "-"} label="Median respons merah" note="Target kurang dari 24 jam" />
          </div>
          <Banner kind="bad">
            <strong>Aturan M1.</strong> Tombol bantuan atau butir keselamatan membuka kasus merah. Hubungi siswa dalam 24 jam; lewat batas, kasus naik ke koordinator BK.
          </Banner>

          <div className="layout-2col">
            <section className="card flush" aria-label="Daftar kasus">
              <div style={{ padding: "4px 12px 0" }}>
                <Tabs
                  label="Jenis kasus"
                  value={tab}
                  onChange={setTab}
                  tabs={[
                    { id: "merah", label: "Merah", count: data.stats.red_open },
                    { id: "kuning", label: "Kuning", count: data.stats.yellow_open },
                    { id: "selesai", label: "Selesai" },
                  ]}
                />
              </div>
              {data.rows.length === 0 ? (
                <EmptyState icon={<Inbox aria-hidden />} title={tab === "selesai" ? "Belum ada kasus selesai" : "Antrean kosong"}>
                  {tab === "merah" ? "Tidak ada kasus merah yang menunggu. Kasus baru muncul di sini dengan pemberitahuan lembut." : "Tidak ada kasus di tab ini."}
                </EmptyState>
              ) : (
                <div className="table-wrap">
                  <table className="table stack-mobile">
                    <caption className="sr-only">Kasus {tab}</caption>
                    <thead>
                      <tr>
                        <th scope="col">Kode</th>
                        <th scope="col">Zona</th>
                        <th scope="col">Sumber (aturan)</th>
                        <th scope="col">Penanggung jawab</th>
                        <th scope="col">Batas respons</th>
                        <th scope="col">Status</th>
                        <th scope="col">
                          <span className="sr-only">Aksi</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.rows.map((r) => (
                        <tr key={r.id} className={r.overdue ? "row-bad" : ""}>
                          <td data-label="Kode" className="cell-main">
                            <span className="mono">{r.code}</span>
                            <span className="caption" style={{ display: "block" }}>
                              {r.class_name}
                            </span>
                          </td>
                          <td data-label="Zona">
                            <ZoneChip zone={r.zone} />
                          </td>
                          <td data-label="Sumber (aturan)" className="small" style={{ maxWidth: 220 }}>
                            {r.rule}
                          </td>
                          <td data-label="Penanggung jawab">
                            {r.unassigned ? <span className="chip chip-warn">Belum ditugaskan</span> : r.owner}
                            {r.escalated && <span className="caption" style={{ display: "block", color: "var(--bad)" }}>Naik ke koordinator</span>}
                          </td>
                          <td data-label="Batas respons" className="nowrap" style={{ color: r.overdue ? "var(--bad)" : undefined, fontWeight: r.overdue ? 700 : 400 }}>
                            {r.status === "ditutup" ? "-" : ["baru", "terlambat"].includes(r.status) ? fmtRemaining(r.hours_left) : "Sudah dihubungi"}
                          </td>
                          <td data-label="Status">
                            <StatusChip status={r.status} />
                          </td>
                          <td className="actions">
                            {r.unassigned ? (
                              <Button size="sm" variant={r.zone === "merah" ? "danger" : "primary"} icon={<UserCheck aria-hidden />} onClick={() => take(r.id)} loading={busy === r.id}>
                                Ambil
                              </Button>
                            ) : r.mine || data.is_coordinator ? (
                              <Link to={`/bk/kasus/${r.id}`} className="btn btn-sm btn-ghost" aria-label={`Buka kasus ${r.code}`}>
                                Buka
                              </Link>
                            ) : (
                              <span className="caption">Konselor lain</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <aside className="card stack sticky-col" aria-labelledby="assign">
              <h2 id="assign">Penugasan otomatis</h2>
              <p className="small">Kasus merah baru diberikan ke konselor dengan beban paling ringan. Koordinator dapat mengalihkan dari halaman kasus.</p>
              <ul className="list">
                {data.counselors.map((c) => (
                  <li key={c.id} className="row between">
                    <span className="strong">{c.title}</span>
                    <span className="small tnum">{c.active} kasus aktif</span>
                  </li>
                ))}
              </ul>
              <Link to="/bk/beban" className="small strong">
                Lihat beban layanan →
              </Link>
            </aside>
          </div>
        </div>
      )}
    </>
  );
}
