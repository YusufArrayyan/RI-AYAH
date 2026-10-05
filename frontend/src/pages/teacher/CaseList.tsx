import { Inbox } from "lucide-react";
import { Link } from "react-router-dom";
import { Banner, EmptyState, ErrorState, LoadingBlock, PageHead, SimTag, Stat, StatusChip } from "../../components/ui";
import { useResource } from "../../lib/api";
import { fmtRemaining } from "../../lib/format";
import { useQueryState } from "../../lib/useQueryState";

interface Row {
  id: number;
  code: string;
  class_name: string;
  status: string;
  student_response: string | null;
  reasons: string[];
  rule_id: string;
  hours_left: number;
  overdue: boolean;
  reminder: boolean;
}
interface ListData {
  stats: { waiting: number; overdue: number; greeted_week: number };
  classes: string[];
  rows: Row[];
  note: string;
}

/** G1 Beranda dan daftar sapaan. */
export default function CaseList() {
  const [cls, setCls] = useQueryState<string>("kelas", "");
  const { data, error, loading, reload } = useResource<ListData>(`/api/teacher/cases?class_name=${encodeURIComponent(cls)}`);

  return (
    <>
      <PageHead title="Siswa yang perlu disapa" meta={<SimTag />} sub="Hanya siswa kelas binaan Anda yang berada di zona kuning. Sapa secara pribadi dalam tujuh hari." />
      {loading && !data && <LoadingBlock />}
      {error && !data && <ErrorState error={error} onRetry={reload} />}
      {data && (
        <div className="stack" style={{ gap: 20 }}>
          <div className="stat-strip">
            <Stat value={data.stats.waiting} label="Menunggu disapa" />
            <Stat value={data.stats.overdue} label="Lewat batas tujuh hari" tone={data.stats.overdue ? "bad" : undefined} />
            <Stat value={data.stats.greeted_week} label="Disapa tujuh hari terakhir" />
          </div>

          <Banner kind="xai">
            Anda melihat alasan ringkas yang sama dengan yang dibaca siswa. Skor, isi check-in, catatan BK, dan kasus merah tidak ditampilkan kepada Anda.
          </Banner>

          {data.classes.length > 1 && (
            <div className="filter-chips" role="group" aria-label="Filter kelas">
              <button type="button" className="filter-chip" aria-pressed={cls === ""} onClick={() => setCls("")}>
                Semua kelas
              </button>
              {data.classes.map((c) => (
                <button key={c} type="button" className="filter-chip" aria-pressed={cls === c} onClick={() => setCls(c)}>
                  {c}
                </button>
              ))}
            </div>
          )}

          <div className="card flush" aria-busy={loading}>
            {data.rows.length === 0 ? (
              <EmptyState icon={<Inbox aria-hidden />} title="Tidak ada yang menunggu disapa">
                Bila ada siswa yang perlu disapa, ia muncul di sini beserta alasannya.
              </EmptyState>
            ) : (
              <div className="table-wrap">
                <table className="table stack-mobile">
                  <caption className="sr-only">Daftar siswa yang perlu disapa</caption>
                  <thead>
                    <tr>
                      <th scope="col">Kode siswa</th>
                      <th scope="col">Kelas</th>
                      <th scope="col">Alasan ringkas</th>
                      <th scope="col">Status</th>
                      <th scope="col">Batas sapa</th>
                      <th scope="col">
                        <span className="sr-only">Aksi</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((r) => (
                      <tr key={r.id} className={r.overdue ? "row-bad" : ""}>
                        <td data-label="Kode siswa" className="cell-main mono">
                          {r.code}
                        </td>
                        <td data-label="Kelas" className="nowrap">
                          {r.class_name}
                        </td>
                        <td data-label="Alasan ringkas" style={{ minWidth: 260, maxWidth: 420 }}>
                          <ul style={{ margin: 0, paddingLeft: "1.1em" }}>
                            {r.reasons.map((t) => (
                              <li key={t}>{t}</li>
                            ))}
                          </ul>
                        </td>
                        <td data-label="Status">
                          <div className="row" style={{ gap: 6 }}>
                            <StatusChip status={r.status} />
                            {r.student_response === "belum_mau" && <span className="chip chip-neutral">Siswa belum mau</span>}
                            {r.student_response === "mau" && <span className="chip chip-ok">Siswa mau disapa</span>}
                          </div>
                        </td>
                        <td data-label="Batas sapa" className="nowrap" style={{ color: r.overdue ? "var(--bad)" : undefined, fontWeight: r.overdue || r.reminder ? 700 : 400 }}>
                          {["baru", "terlambat"].includes(r.status) ? fmtRemaining(r.hours_left) : "-"}
                          {r.reminder && !r.overdue && <span className="caption" style={{ display: "block" }}>Pengingat hari ke-5</span>}
                        </td>
                        <td className="actions">
                          <Link to={`/guru/kasus/${r.id}`} className={`btn btn-sm ${r.overdue ? "btn-danger" : "btn-ghost"}`} aria-label={`Buka kasus ${r.code}`}>
                            Buka
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <p className="caption">{data.note}</p>
        </div>
      )}
    </>
  );
}
