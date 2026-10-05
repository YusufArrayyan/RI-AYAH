import { useState } from "react";
import { HBar, WeekBars } from "../../components/charts";
import { Banner, Button, ConfirmDialog, ErrorState, LoadingBlock, PageHead, SimTag, Stat, XaiBox } from "../../components/ui";
import { api, useResource } from "../../lib/api";
import { pct, fmtNum } from "../../lib/format";
import { useToast } from "../../lib/toast";

interface LoadData {
  active: number;
  capacity: number;
  utilization: number;
  red_median_hours: number | null;
  per_counselor: { id: number; title: string; active: number; capacity: number; ratio: number }[];
  trend: { week_offset: number; kuning: number; merah: number }[];
  over_threshold: boolean;
  suggestion: string | null;
}

/** K4 Beban layanan. */
export default function Load() {
  const { data, error, loading, reload } = useResource<LoadData>("/api/counselor/load");
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("Beban BK di atas 85% dua pekan berturut-turut. Mohon hitung di estimator apakah ambang K2 perlu dinaikkan sementara.");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try {
      await api("/api/counselor/load/suggest", { method: "POST", json: { message: msg } });
      setOpen(false);
      toast("Saran terkirim ke admin.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageHead title="Beban layanan" meta={<SimTag />} sub="Penandaan tidak boleh melebihi kemampuan layanan. Bila beban terlalu tinggi, ambang aturan ikut ditinjau." />
      {loading && !data && <LoadingBlock />}
      {error && !data && <ErrorState error={error} onRetry={reload} />}
      {data && (
        <div className="stack" style={{ gap: 20 }}>
          <div className="stat-strip">
            <Stat value={data.active} label="Kasus aktif di BK" note={`Kapasitas ${data.capacity}`} />
            <Stat value={pct(data.utilization)} label="Pemakaian kapasitas" tone={data.utilization > 0.85 ? "warn" : undefined} />
            <Stat value={data.red_median_hours !== null ? `${fmtNum(data.red_median_hours)} jam` : "-"} label="Median respons merah" />
          </div>
          {data.suggestion && (
            <Banner kind="warn" action={<Button size="sm" variant="ghost" onClick={() => setOpen(true)}>Kirim saran ke admin</Button>}>
              {data.suggestion}
            </Banner>
          )}
          <div className="layout-2col even">
            <section className="card stack" aria-labelledby="per">
              <h2 id="per">Kasus aktif per konselor</h2>
              <p className="small muted">Garis hitam menandai kapasitas. Tidak ada peringkat; angka dipakai untuk membagi beban.</p>
              {data.per_counselor.map((p) => (
                <HBar key={p.id} label={p.title} value={p.active} max={Math.max(p.capacity * 1.4, p.active)} mark={p.capacity} display={`${p.active}/${p.capacity}`} tone={p.ratio > 1 ? "bad" : p.ratio > 0.85 ? "warn" : undefined} />
              ))}
            </section>
            <section className="card stack" aria-labelledby="tren">
              <h2 id="tren">Kasus baru per pekan</h2>
              <WeekBars label="Kasus baru per pekan" data={data.trend.map((t) => ({ label: t.week_offset === 0 ? "Ini" : `${t.week_offset}`, kuning: t.kuning, merah: t.merah }))} />
              <div className="row small" style={{ gap: 16 }}>
                <span className="row nowrap-row" style={{ gap: 6 }}>
                  <span aria-hidden style={{ width: 12, height: 12, borderRadius: 3, background: "var(--warn-fill)" }} /> Kuning
                </span>
                <span className="row nowrap-row" style={{ gap: 6 }}>
                  <span aria-hidden style={{ width: 12, height: 12, borderRadius: 3, background: "var(--bad)" }} /> Merah
                </span>
                <span className="caption">Angka di sumbu: pekan relatif terhadap pekan ini</span>
              </div>
            </section>
          </div>
          <XaiBox title="Hubungan ambang dan beban">
            <p>
              Ambang yang lebih rendah menandai lebih banyak siswa dan menambah beban. Bila kasus melebihi kapasitas, sapaan menjadi formalitas dan merah menumpuk. Admin dapat
              menghitung dampak perubahan ambang di estimator (A3); perubahan berlaku setelah disetujui komite.
            </p>
          </XaiBox>
        </div>
      )}
      <ConfirmDialog open={open} title="Kirim saran ke admin" consequence="Saran ini masuk ke halaman Aturan dan ambang (A3) dan tercatat di log audit." confirmLabel="Kirim" loading={busy} onConfirm={send} onCancel={() => setOpen(false)}>
        <label className="label" htmlFor="sug">
          Isi saran
        </label>
        <textarea id="sug" className="textarea" value={msg} onChange={(e) => setMsg(e.target.value)} />
      </ConfirmDialog>
    </>
  );
}
