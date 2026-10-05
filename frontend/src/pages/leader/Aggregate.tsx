import { Download, EyeOff } from "lucide-react";
import { HBar, LineChart } from "../../components/charts";
import { Banner, Button, EmptyState, ErrorState, LoadingBlock, PageHead, SimTag, Stat, XaiBox } from "../../components/ui";
import { useResource } from "../../lib/api";
import { pct, fmtNum } from "../../lib/format";
import { useQueryState } from "../../lib/useQueryState";

interface Agg {
  weeks: number;
  enough_data: boolean;
  participation: number | null;
  timely_rate: number | null;
  red_median_hours: number | null;
  trend: { label: string; value: number }[];
  levels: { level: string; hidden: boolean; participation: number | null; timely: number | null; n: number | null }[];
  min_group: number;
  actions: string[];
}

/** P1 Dasbor agregat. */
export default function Aggregate() {
  const [weeksParam, setWeeksParam] = useQueryState<string>("pekan", "8");
  const weeks = Number(weeksParam) || 8;
  const setWeeks = (w: number) => setWeeksParam(String(w));
  const { data, error, loading, reload } = useResource<Agg>(`/api/leader/dashboard?weeks=${weeks}`);

  const exportCsv = () => {
    if (!data) return;
    const rows = [
      ["Ringkasan Ri'ayah (SIMULASI)", `${data.weeks} pekan`],
      ["Partisipasi", pct(data.participation)],
      ["Sapaan tepat waktu", pct(data.timely_rate)],
      ["Median respons merah (jam)", String(data.red_median_hours ?? "-")],
      [],
      ["Jenjang", "Partisipasi", "Sapaan tepat waktu"],
      ...data.levels.map((l) => [l.level, l.hidden ? `disembunyikan (<${data.min_group})` : pct(l.participation), l.hidden ? "" : pct(l.timely)]),
    ];
    const blob = new Blob([rows.map((r) => r.join(",")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "ringkasan-agregat-riayah.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <>
      <PageHead
        title="Dasbor agregat"
        meta={<SimTag />}
        sub="Untuk merencanakan layanan. Tidak ada data individu, kode siswa, atau peringkat di halaman ini."
        actions={
          <Button variant="ghost" icon={<Download aria-hidden />} onClick={exportCsv} disabled={!data}>
            Unduh ringkasan
          </Button>
        }
      />
      <div className="filter-chips" role="group" aria-label="Periode" style={{ marginBottom: 16 }}>
        {[4, 8, 12].map((w) => (
          <button key={w} type="button" className="filter-chip" aria-pressed={weeks === w} onClick={() => setWeeks(w)}>
            {w} pekan
          </button>
        ))}
      </div>
      {loading && !data && <LoadingBlock />}
      {error && !data && <ErrorState error={error} onRetry={reload} />}
      {data && !data.enough_data && (
        <div className="card">
          <EmptyState title="Belum cukup data">Dasbor terisi setelah beberapa pekan pemakaian.</EmptyState>
        </div>
      )}
      {data && data.enough_data && (
        <div className="stack" style={{ gap: 20 }} aria-busy={loading}>
          <div className="stat-strip">
            <Stat value={pct(data.participation)} label="Siswa yang ikut" note="Dari yang ditawari persetujuan" />
            <Stat value={pct(data.timely_rate)} label="Kuning disapa dalam 7 hari" note="Target awal 80%" tone={data.timely_rate !== null && data.timely_rate < 0.8 ? "warn" : undefined} />
            <Stat value={data.red_median_hours !== null ? `${fmtNum(data.red_median_hours)} jam` : "-"} label="Median respons merah" note="Target kurang dari 24 jam" />
          </div>
          <XaiBox title="Mengapa data individu tidak tampil">
            <p>Pimpinan merencanakan layanan, bukan menilai siswa atau guru. Kelompok dengan kurang dari {data.min_group} siswa disembunyikan agar tidak ada yang bisa dikenali.</p>
          </XaiBox>
          <div className="layout-2col even">
            <section className="card stack" aria-labelledby="tren">
              <h2 id="tren">Kasus baru per pekan</h2>
              <LineChart points={data.trend} label="Kasus baru per pekan" />
            </section>
            <section className="card stack" aria-labelledby="jenjang">
              <h2 id="jenjang">Per jenjang</h2>
              {data.levels.map((l) =>
                l.hidden ? (
                  <div key={l.level} className="hbar">
                    <span>{l.level}</span>
                    <span className="row nowrap-row caption" style={{ gap: 6 }}>
                      <EyeOff aria-hidden style={{ width: 14, height: 14 }} /> Disembunyikan: kurang dari {data.min_group} siswa
                    </span>
                    <span />
                  </div>
                ) : (
                  <div key={l.level} className="stack" style={{ gap: 0 }}>
                    <HBar label={`${l.level} · ikut`} hint={`${l.n} siswa`} value={l.participation ?? 0} display={pct(l.participation)} />
                    <HBar label={`${l.level} · tepat waktu`} value={l.timely ?? 0} display={l.timely === null ? "-" : pct(l.timely)} tone="xai" />
                  </div>
                ),
              )}
            </section>
          </div>
          <Banner kind="info">Halaman ini tidak menampilkan peringkat kelas atau guru. Angka dipakai untuk menambah dukungan, bukan menilai kinerja.</Banner>
          <section className="card stack" aria-labelledby="aksi">
            <h2 id="aksi">Yang dapat dilakukan</h2>
            <ul style={{ margin: 0, paddingLeft: "1.2em" }} className="stack">
              {data.actions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </>
  );
}
