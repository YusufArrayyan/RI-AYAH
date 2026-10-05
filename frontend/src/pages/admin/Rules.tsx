import { Minus, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { HBar } from "../../components/charts";
import { Banner, Button, ErrorState, LoadingBlock, PageHead, SimTag, XaiBox } from "../../components/ui";
import { api, useResource } from "../../lib/api";
import { fmtDate, fmtNum } from "../../lib/format";
import { useToast } from "../../lib/toast";

type Params = Record<string, Record<string, number>>;
interface Estimate {
  per_week: { week: number; new_cases: number }[];
  average: number;
  capacity: number;
  utilization: number | null;
  over_capacity: boolean;
}
interface Version {
  id: number;
  rule_id: string;
  version: number;
  params: Record<string, number>;
  status: string;
  reason: string | null;
  owner: string | null;
  text: string;
  proposed_by: string | null;
  approved_by: string | null;
  created_at: string;
}
interface RulesData {
  specs: Record<string, Record<string, { label: string; min: number; max: number }>>;
  texts: Record<string, string>;
  active: Params;
  versions: Version[];
  estimate: Estimate;
  k2_route: "guru" | "bk";
  bk_suggestions: { from: string; message: string; at: string }[];
}
export const RULE_STATUS: Record<string, [string, string]> = {
  aktif: ["Aktif", "chip-ok"],
  diajukan: ["Menunggu komite", "chip-warn"],
  draf: ["Draf", "chip-neutral"],
  ditolak: ["Ditolak", "chip-bad"],
  arsip: ["Arsip", "chip-neutral"],
};

function Stepper({ id, label, value, min, max, onChange }: { id: string; label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="field">
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <div className="row nowrap-row" style={{ gap: 6 }}>
        <button type="button" className="icon-btn" style={{ border: "1.5px solid var(--line-strong)" }} onClick={() => onChange(Math.max(min, value - 1))} aria-label={`Kurangi ${label}`} disabled={value <= min}>
          <Minus aria-hidden style={{ width: 18, height: 18 }} />
        </button>
        <input id={id} className="input tnum" style={{ width: 72, textAlign: "center" }} type="number" min={min} max={max} value={value} onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value) || min)))} />
        <button type="button" className="icon-btn" style={{ border: "1.5px solid var(--line-strong)" }} onClick={() => onChange(Math.min(max, value + 1))} aria-label={`Tambah ${label}`} disabled={value >= max}>
          <Plus aria-hidden style={{ width: 18, height: 18 }} />
        </button>
        <span className="caption">
          {min}–{max}
        </span>
      </div>
    </div>
  );
}

/** A3 Aturan dan ambang. */
export default function Rules() {
  const { data, error, loading, reload } = useResource<RulesData>("/api/admin/rules");
  const toast = useToast();
  const [draft, setDraft] = useState<Params | null>(null);
  const [est, setEst] = useState<Estimate | null>(null);
  const [estBusy, setEstBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const timer = useRef<number>(0);

  useEffect(() => {
    if (data && !draft) {
      setDraft(JSON.parse(JSON.stringify(data.active)));
      setEst(data.estimate);
    }
  }, [data, draft]);

  const changed = (rid: string) => draft && data && JSON.stringify(draft[rid]) !== JSON.stringify(data.active[rid]);
  const update = (rid: string, key: string, v: number) => {
    if (!draft) return;
    const next = { ...draft, [rid]: { ...draft[rid], [key]: v } };
    setDraft(next);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      setEstBusy(true);
      try {
        setEst(await api<Estimate>("/api/admin/rules/estimate", { method: "POST", json: { params: next } }));
      } catch (e) {
        setErr((e as Error).message);
      } finally {
        setEstBusy(false);
      }
    }, 300);
  };

  const save = async (submit: boolean) => {
    if (!draft || !data) return;
    const rids = Object.keys(draft).filter((r) => changed(r));
    if (!rids.length) return;
    setBusy(submit ? "submit" : "draft");
    setErr(null);
    try {
      for (const rid of rids) {
        await api("/api/admin/rules/draft", { method: "POST", json: { rule_id: rid, params: draft[rid], reason, submit } });
      }
      toast(submit ? "Diajukan ke komite. Berlaku setelah disetujui." : "Draf tersimpan.");
      setReason("");
      setDraft(null);
      reload();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const route = async (to: "guru" | "bk") => {
    try {
      await api("/api/admin/settings/k2-route", { method: "POST", json: { to } });
      toast(to === "bk" ? "Kuning dari check-in kini langsung ke BK." : "Kuning dari check-in ke wali kelas sebagai tanda umum.");
      reload();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  if (loading && !data) return <LoadingBlock />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (!data || !draft) return null;
  const anyChanged = Object.keys(draft).some((r) => changed(r));
  const e = est ?? data.estimate;
  const maxBar = Math.max(e.capacity * 1.3, ...e.per_week.map((p) => p.new_cases));

  return (
    <>
      <PageHead title="Aturan dan ambang" meta={<SimTag />} sub="Usulkan parameter dan lihat dampaknya pada beban sebelum diajukan. Perubahan berlaku setelah komite menyetujui (4 mata)." />
      <div className="stack" style={{ gap: 20 }}>
        <Banner kind="warn">Semua angka di sini adalah placeholder dari perancang. Psikolog, konselor, dan komite etik menetapkan nilai akhirnya.</Banner>
        {data.bk_suggestions.length > 0 && (
          <Banner kind="info">
            <strong>Saran dari BK:</strong> “{data.bk_suggestions[data.bk_suggestions.length - 1].message}” — {data.bk_suggestions[data.bk_suggestions.length - 1].from}
          </Banner>
        )}
        {err && <Banner kind="bad">{err}</Banner>}

        <div className="layout-2col">
          <div className="stack" style={{ gap: 12 }}>
            {(["M1", "K1", "K2", "L"] as const).map((rid) => (
              <section key={rid} className="card stack" style={{ gap: 12, borderColor: changed(rid) ? "var(--primary)" : undefined }} aria-labelledby={`r-${rid}`}>
                <div className="row between">
                  <h2 id={`r-${rid}`} className="row nowrap-row" style={{ gap: 10 }}>
                    <span className="chip chip-xai mono">{rid}</span>
                    <span style={{ fontSize: 16 }}>{data.texts[rid]}</span>
                  </h2>
                  {changed(rid) && <span className="chip chip-info">Diubah</span>}
                </div>
                <div className="row" style={{ gap: 20, alignItems: "flex-end" }}>
                  {Object.entries(data.specs[rid]).map(([k, s]) => (
                    <Stepper key={k} id={`${rid}-${k}`} label={s.label} value={draft[rid][k]} min={s.min} max={s.max} onChange={(v) => update(rid, k, v)} />
                  ))}
                </div>
              </section>
            ))}
            <section className="card stack">
              <h2>Rute kuning dari check-in (K2)</h2>
              <p className="small">Rekomendasi sementara untuk sekolah: langsung ke BK. Wali kelas lalu tidak melihat tanda dari check-in sama sekali.</p>
              <div className="filter-chips" role="radiogroup" aria-label="Rute K2">
                <button type="button" role="radio" aria-checked={data.k2_route === "guru"} aria-pressed={data.k2_route === "guru"} className="filter-chip" onClick={() => route("guru")}>
                  Ke wali kelas (tanda umum)
                </button>
                <button type="button" role="radio" aria-checked={data.k2_route === "bk"} aria-pressed={data.k2_route === "bk"} className="filter-chip" onClick={() => route("bk")}>
                  Langsung ke BK
                </button>
              </div>
            </section>
          </div>

          <aside className="stack sticky-col">
            <section className="card stack" aria-labelledby="est" aria-busy={estBusy}>
              <div className="row between">
                <h2 id="est">Estimator beban</h2>
                {estBusy && <span className="caption">Menghitung…</span>}
              </div>
              <p className="small muted">Aturan dijalankan ulang pada data empat minggu terakhir. Garis hitam: kapasitas BK per minggu.</p>
              {e.per_week.map((p) => (
                <HBar key={p.week} label={`Minggu ${p.week}`} value={p.new_cases} max={maxBar} mark={e.capacity} display={`${p.new_cases}`} tone={p.new_cases > e.capacity ? "bad" : undefined} />
              ))}
              <p className="strong">
                Rata-rata {fmtNum(e.average)} kasus baru per minggu · kapasitas {e.capacity}
              </p>
              {e.over_capacity && <Banner kind="bad">Ambang ini membuat beban di atas 85% kapasitas. Obrolan berisiko jadi sekadar formalitas.</Banner>}
            </section>
            <XaiBox title="Akibat ambang">
              <p>Menurunkan jumlah minggu K1 atau ambang K2 menandai lebih banyak siswa lebih awal, tetapi menambah beban guru dan BK. Estimator memakai aturan yang sama dengan yang berjalan.</p>
            </XaiBox>
            <section className="card stack">
              <label className="label" htmlFor="why">
                Alasan perubahan
              </label>
              <textarea id="why" className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Misalnya: beban BK di atas 85% dua minggu…" />
              <div className="choice-row two">
                <Button variant="ghost" onClick={() => save(false)} loading={busy === "draft"} disabled={!anyChanged || reason.trim().length < 10}>
                  Simpan draf
                </Button>
                <Button onClick={() => save(true)} loading={busy === "submit"} disabled={!anyChanged || reason.trim().length < 10}>
                  Ajukan ke komite
                </Button>
              </div>
            </section>
          </aside>
        </div>

        <section className="card flush" aria-labelledby="ver">
          <h2 id="ver" style={{ padding: "16px 16px 4px" }}>
            Versi aturan
          </h2>
          <div className="table-wrap">
            <table className="table stack-mobile">
              <caption className="sr-only">Versi aturan</caption>
              <thead>
                <tr>
                  <th scope="col">Aturan</th>
                  <th scope="col">Parameter</th>
                  <th scope="col">Status</th>
                  <th scope="col">Diusulkan</th>
                  <th scope="col">Alasan</th>
                </tr>
              </thead>
              <tbody>
                {data.versions.map((v) => (
                  <tr key={v.id}>
                    <td data-label="Aturan" className="cell-main mono">
                      {v.rule_id} v{v.version}
                    </td>
                    <td data-label="Parameter" className="small" style={{ fontFamily: "var(--font-mono)", minWidth: 130 }}>
                      {Object.entries(v.params).map(([k, val]) => (
                        <span key={k} style={{ display: "block" }}>
                          {k}={val}
                        </span>
                      ))}
                    </td>
                    <td data-label="Status">
                      <span className={`chip ${RULE_STATUS[v.status][1]}`}>{RULE_STATUS[v.status][0]}</span>
                    </td>
                    <td data-label="Diusulkan" className="small">
                      {v.proposed_by} · {fmtDate(v.created_at)}
                    </td>
                    <td data-label="Alasan" className="small" style={{ minWidth: 220, maxWidth: 380, whiteSpace: "pre-line" }}>
                      {v.reason}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}
