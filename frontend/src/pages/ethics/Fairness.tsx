import { EyeOff, Flag } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { HBar } from "../../components/charts";
import { Banner, Button, ConfirmDialog, ErrorState, LoadingBlock, PageHead, SimTag, Stat, XaiBox } from "../../components/ui";
import { api, useResource } from "../../lib/api";
import { fmtNum, pct } from "../../lib/format";
import { useToast } from "../../lib/toast";

interface FairRow {
  group: string;
  n: number | null;
  hidden: boolean;
  flag_rate?: number;
  ratio?: number;
  timely_rate?: number | null;
  status?: "Tinjau" | "Wajar";
}
interface FairData {
  reference_rate: number;
  rows: FairRow[];
  min_group: number;
  timeliness: { yellow_total: number; timely: number; rate: number | null };
}

/** E2 Keadilan. */
export default function Fairness() {
  const { data, error, loading, reload } = useResource<FairData>("/api/ethics/fairness");
  const toast = useToast();
  const [flag, setFlag] = useState<FairRow | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!flag) return;
    setBusy(true);
    try {
      await api("/api/ethics/fairness/flag", { method: "POST", json: { group: flag.group, note } });
      toast("Keputusan tercatat di log audit.");
      setFlag(null);
      setNote("");
    } finally {
      setBusy(false);
    }
  };
  const maxRate = Math.max(0.01, ...(data?.rows.map((r) => r.flag_rate ?? 0) ?? [0]));
  return (
    <>
      <PageHead title="Keadilan" meta={<SimTag />} sub="Apakah kelompok tertentu ditandai atau terlewat lebih sering? Atribut demografi hanya dipakai untuk audit ini, tidak pernah sebagai fitur aturan." />
      {loading && !data && <LoadingBlock />}
      {error && !data && <ErrorState error={error} onRetry={reload} />}
      {data && (
        <div className="stack" style={{ gap: 20 }}>
          <Banner kind="warn">Angka di halaman ini berasal dari data SIMULASI untuk menunjukkan tata letak. Ambang “Tinjau” (rasio di luar 0,8–1,25) adalah usulan.</Banner>
          <div className="stat-strip">
            <Stat value={pct(data.reference_rate, 1)} label="Tingkat penandaan keseluruhan" note="Referensi rasio" />
            <Stat value={pct(data.timeliness.rate)} label="Kuning disapa dalam 7 hari" note={`${data.timeliness.timely} dari ${data.timeliness.yellow_total}`} />
            <Stat value={data.rows.filter((r) => r.status === "Tinjau").length} label="Kelompok perlu ditinjau" tone={data.rows.some((r) => r.status === "Tinjau") ? "warn" : undefined} />
          </div>
          <div className="layout-2col">
            <section className="card flush" aria-labelledby="grp">
              <h2 id="grp" style={{ padding: "16px 16px 4px" }}>
                Tingkat penandaan per kelompok
              </h2>
              <div className="table-wrap">
                <table className="table stack-mobile">
                  <caption className="sr-only">Keadilan per kelompok</caption>
                  <thead>
                    <tr>
                      <th scope="col">Kelompok</th>
                      <th scope="col" style={{ minWidth: 220 }}>
                        Tingkat penandaan
                      </th>
                      <th scope="col">Rasio</th>
                      <th scope="col">Sapaan tepat</th>
                      <th scope="col">Status</th>
                      <th scope="col">
                        <span className="sr-only">Aksi</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((r) =>
                      r.hidden ? (
                        <tr key={r.group}>
                          <td data-label="Kelompok" className="cell-main">
                            {r.group}
                          </td>
                          <td colSpan={5} className="caption">
                            <span className="row nowrap-row" style={{ gap: 6 }}>
                              <EyeOff aria-hidden style={{ width: 14, height: 14 }} /> Disembunyikan: kurang dari {data.min_group} orang
                            </span>
                          </td>
                        </tr>
                      ) : (
                        <tr key={r.group} className={r.status === "Tinjau" ? "row-warn" : ""}>
                          <td data-label="Kelompok" className="cell-main" style={{ minWidth: 170 }}>
                            {r.group}
                            <span className="caption" style={{ display: "block", fontWeight: 400 }}>
                              n = {r.n}
                            </span>
                          </td>
                          <td data-label="Tingkat penandaan">
                            <HBar label="" value={r.flag_rate ?? 0} max={maxRate} mark={data.reference_rate} display={pct(r.flag_rate, 1)} tone={r.status === "Tinjau" ? "warn" : undefined} />
                          </td>
                          <td data-label="Rasio" className="tnum strong">
                            {fmtNum(r.ratio, 2)}
                          </td>
                          <td data-label="Sapaan tepat" className="tnum">
                            {r.timely_rate === null || r.timely_rate === undefined ? "-" : pct(r.timely_rate)}
                          </td>
                          <td data-label="Status">
                            {r.status === "Tinjau" ? (
                              <Link to="/komite/aturan" className="chip chip-warn" style={{ textDecoration: "none" }}>
                                Tinjau → E4
                              </Link>
                            ) : (
                              <span className="chip chip-ok">Wajar</span>
                            )}
                          </td>
                          <td className="actions">
                            <Button size="sm" variant="quiet" icon={<Flag aria-hidden />} onClick={() => setFlag(r)} aria-label={`Catat keputusan untuk ${r.group}`}>
                              Catat
                            </Button>
                          </td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </div>
            </section>
            <aside className="stack sticky-col">
              <XaiBox title="Cara membaca" tag="XAI-5">
                <p>Rasio 1,00 berarti kelompok ditandai sama seringnya dengan keseluruhan. Garis hitam pada batang adalah tingkat keseluruhan.</p>
                <p style={{ marginTop: 6 }}>Rasio tinggi bisa berarti aturan terlalu peka untuk kelompok itu; rasio rendah bisa berarti siswa kelompok itu terlewat.</p>
              </XaiBox>
              <section className="card stack" style={{ gap: 6 }}>
                <h2 style={{ fontSize: 16 }}>Tindak lanjut</h2>
                <p className="small">Kelompok berstatus “Tinjau” dibahas di rapat komite. Keputusan dicatat, lalu aturan yang perlu diubah masuk registri (E4) dengan uji penjelasan ulang.</p>
              </section>
            </aside>
          </div>
        </div>
      )}
      <ConfirmDialog open={!!flag} title={`Catat keputusan: ${flag?.group ?? ""}`} consequence="Catatan masuk log audit sebagai bahan rapat komite." confirmLabel="Simpan" loading={busy} onConfirm={save} onCancel={() => setFlag(null)}>
        <label className="label" htmlFor="fn">
          Keputusan atau catatan
        </label>
        <textarea id="fn" className="textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Misalnya: tandai K1 untuk ditinjau pada jenjang SD…" />
      </ConfirmDialog>
    </>
  );
}
