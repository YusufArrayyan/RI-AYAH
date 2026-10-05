import { FlaskConical } from "lucide-react";
import { useState } from "react";
import { HBar } from "../../components/charts";
import { Banner, Button, ErrorState, LoadingBlock, PageHead, SimTag, XaiBox } from "../../components/ui";
import { api, useResource } from "../../lib/api";
import { fmtDate, fmtDateTime, pct } from "../../lib/format";
import { useToast } from "../../lib/toast";
import { RULE_STATUS } from "../admin/Rules";

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
  proposed_by_id: number | null;
  approved_by: string | null;
  created_at: string;
}
interface Test {
  test: string;
  value: number;
  target: number;
  passed: boolean;
  simulated: boolean;
  detail: string | null;
  run_at: string;
}
interface Reg {
  versions: Version[];
  tests: Test[];
  release_blocked: boolean;
  me: number;
}
const TEST_INFO: Record<string, { title: string; q: string }> = {
  kesetiaan: { title: "Kesetiaan", q: "Apakah penjelasan sama dengan aturan yang benar-benar dijalankan?" },
  stabilitas: { title: "Stabilitas", q: "Apakah data yang mirip memberi alasan yang sama?" },
  keterpahaman: { title: "Keterpahaman", q: "Apakah siswa dan guru memahami alasan?" },
  akurasi_kontrafaktual: { title: "Akurasi kontrafaktual", q: "Apakah mengikuti saran benar-benar melepas tanda?" },
};

/** E4 Registri aturan dan XAI. */
export default function Registry() {
  const { data, error, loading, reload } = useResource<Reg>("/api/ethics/rules");
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    setBusy("run");
    setErr(null);
    try {
      await api("/api/ethics/xai/run", { method: "POST" });
      toast("Uji penjelasan selesai dijalankan.");
      reload();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const decide = async (id: number, ok: boolean) => {
    setBusy(`${ok ? "a" : "r"}${id}`);
    setErr(null);
    try {
      await api(`/api/ethics/rules/${id}/${ok ? "approve" : "reject"}`, { method: "POST" });
      toast(ok ? "Aturan disetujui dan berlaku." : "Usulan ditolak.");
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
        title="Registri aturan dan XAI"
        meta={<SimTag />}
        sub="Sumber kebenaran aturan yang berjalan dan hasil uji kualitas penjelasan. Aturan draf tidak berlaku sampai disetujui."
        actions={
          <Button variant="xai" icon={<FlaskConical aria-hidden />} onClick={run} loading={busy === "run"}>
            Jalankan uji
          </Button>
        }
      />
      {loading && !data && <LoadingBlock />}
      {error && !data && <ErrorState error={error} onRetry={reload} />}
      {data && (
        <div className="stack" style={{ gap: 20 }}>
          {data.release_blocked ? (
            <Banner kind="bad">Satu atau lebih uji belum lolos. Rilis aturan baru tertahan sampai semua uji lolos.</Banner>
          ) : (
            <Banner kind="xai">Semua uji lolos pada {data.tests[0] ? fmtDateTime(data.tests[0].run_at) : "-"}. Aturan baru boleh disetujui.</Banner>
          )}
          {err && <Banner kind="bad">{err}</Banner>}

          <section className="grid-4" aria-label="Uji kualitas penjelasan">
            {data.tests.map((t) => (
              <article key={t.test} className="card stack" style={{ gap: 8, borderColor: t.passed ? undefined : "var(--bad)" }}>
                <div className="row between nowrap-row">
                  <h2 style={{ fontSize: 16 }}>{TEST_INFO[t.test]?.title ?? t.test}</h2>
                  <span className={`chip ${t.passed ? "chip-ok" : "chip-bad"}`}>{t.passed ? "Lolos" : "Gagal"}</span>
                </div>
                <p className="caption">{TEST_INFO[t.test]?.q}</p>
                <HBar label="" value={t.value} max={1} mark={t.target} display={pct(t.value)} tone={t.passed ? "xai" : "bad"} />
                <p className="small">{t.detail}</p>
                <p className="caption">Target {pct(t.target)}</p>
                {t.simulated && <span className="chip chip-sim" style={{ alignSelf: "flex-start" }}>SIMULASI</span>}
              </article>
            ))}
          </section>
          <XaiBox title="Bagaimana uji dihitung" tag="XAI-7">
            <p>
              Kesetiaan menjalankan ulang aturan pada setiap penandaan dan membandingkan alasannya. Stabilitas mengubah nilai kuis ±1 poin. Akurasi kontrafaktual mensimulasikan siswa mengikuti
              saran sementara indikator pemicu lain terus memburuk. Keterpahaman memerlukan survei pada siswa dan guru nyata, sehingga masih SIMULASI.
            </p>
          </XaiBox>

          <section className="card flush" aria-labelledby="reg">
            <h2 id="reg" style={{ padding: "16px 16px 4px" }}>
              Versi aturan
            </h2>
            <div className="table-wrap">
              <table className="table stack-mobile">
                <caption className="sr-only">Registri aturan</caption>
                <thead>
                  <tr>
                    <th scope="col">Aturan</th>
                    <th scope="col">Parameter</th>
                    <th scope="col">Status</th>
                    <th scope="col">Alasan</th>
                  </tr>
                </thead>
                <tbody>
                  {data.versions.map((v) => (
                    <tr key={v.id} className={v.status === "diajukan" ? "row-warn" : ""}>
                      <td data-label="Aturan" className="cell-main" style={{ minWidth: 220 }}>
                        <span className="mono">
                          {v.rule_id} v{v.version}
                        </span>
                        <span className="caption" style={{ display: "block", fontWeight: 400 }}>
                          {v.text}
                        </span>
                        <span className="caption" style={{ display: "block", fontWeight: 400 }}>
                          Pemilik keputusan: {v.owner}
                        </span>
                      </td>
                      <td data-label="Parameter" className="small" style={{ fontFamily: "var(--font-mono)", minWidth: 130 }}>
                        {Object.entries(v.params).map(([k, val]) => (
                          <span key={k} style={{ display: "block" }}>
                            {k}={val}
                          </span>
                        ))}
                      </td>
                      <td data-label="Status" style={{ minWidth: 190 }}>
                        <span className={`chip ${RULE_STATUS[v.status][1]}`}>{RULE_STATUS[v.status][0]}</span>
                        <span className="caption" style={{ display: "block", marginTop: 4 }}>
                          {v.proposed_by}
                          {v.approved_by ? ` → ${v.approved_by}` : ""} · {fmtDate(v.created_at)}
                        </span>
                        {v.status === "diajukan" &&
                          (v.proposed_by_id === data.me ? (
                            <span className="caption">Usulan Anda; perlu orang lain</span>
                          ) : (
                            <div className="row nowrap-row" style={{ gap: 6, marginTop: 8 }}>
                              <Button size="sm" variant="ghost" onClick={() => decide(v.id, false)} loading={busy === `r${v.id}`}>
                                Tolak
                              </Button>
                              <Button size="sm" onClick={() => decide(v.id, true)} loading={busy === `a${v.id}`} disabled={data.release_blocked}>
                                Setujui
                              </Button>
                            </div>
                          ))}
                      </td>
                      <td data-label="Alasan" className="small" style={{ minWidth: 220, maxWidth: 360, whiteSpace: "pre-line" }}>
                        {v.reason}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
