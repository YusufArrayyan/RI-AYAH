import { CircleCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Banner, Button, ErrorState, LoadingBlock, SeenPanel, SwitchRow, XaiBox } from "../../components/ui";
import { api, useResource } from "../../lib/api";
import { fmtDate } from "../../lib/format";
import { useToast } from "../../lib/toast";
import { CONSENT_STATUS, ChildPicker, useChildren } from "./common";

interface GConsent {
  child: { id: number; name: string; class_name: string; mode: string };
  items: { type: string; label: string; description: string; granted: boolean; child_assent: boolean | null; since: string | null }[];
  status: string;
  purpose: string;
  not_read: string[];
  rights: string[];
  not_shown: string;
}

/** W1 Persetujuan wali (UU PDP Pasal 25 ayat 2). */
export default function GuardianConsent() {
  const kids = useChildren();
  const sid = kids.selected?.id;
  const res = useResource<GConsent>(sid ? `/api/guardian/children/${sid}/consent` : null);
  const toast = useToast();
  const [choices, setChoices] = useState<Record<string, boolean>>({});
  const [legal, setLegal] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<null | "setuju" | "tidak">(null);

  useEffect(() => {
    if (res.data) {
      setChoices(Object.fromEntries(res.data.items.map((i) => [i.type, i.granted])));
      setDone(null);
      setLegal(false);
    }
  }, [res.data]);

  if (kids.loading && !kids.data) return <LoadingBlock />;
  if (kids.error && !kids.data) return <ErrorState error={kids.error} onRetry={kids.reload} />;
  const d = res.data;

  const save = async (agree: boolean) => {
    setBusy(agree ? "setuju" : "tidak");
    setErr(null);
    const payload = agree ? choices : Object.fromEntries(Object.keys(choices).map((k) => [k, false]));
    try {
      await api(`/api/guardian/children/${sid}/consent`, { method: "POST", json: { choices: payload, legal_guardian: legal } });
      await Promise.all([res.reload(), kids.reload()]);
      setDone(agree ? "setuju" : "tidak");
      toast(agree ? "Persetujuan tersimpan." : "Tidak setuju tersimpan. Data anak tidak diproses.");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <h1>Persetujuan untuk {kids.selected?.nickname}</h1>
      {kids.data && <ChildPicker items={kids.data} selected={kids.selected} onSelect={kids.select} />}
      {res.loading && !d && <LoadingBlock lines={2} />}
      {res.error && !d && <ErrorState error={res.error} onRetry={res.reload} />}
      {d && (
        <>
          <div className="row">
            <span className={`chip ${CONSENT_STATUS[d.status].cls}`}>{CONSENT_STATUS[d.status].label}</span>
            <span className="small muted">
              {d.child.name} · {d.child.class_name}
            </span>
          </div>
          <section className="card stack" style={{ gap: 6 }}>
            <h2 style={{ fontSize: 17 }}>Untuk apa?</h2>
            <p>{d.purpose}</p>
          </section>
          <SeenPanel seen={d.items.map((i) => i.label)} notSeen={d.not_read} />

          <section className="card" aria-label="Pilihan data">
            {d.items.map((i) => (
              <SwitchRow
                key={i.type}
                label={i.label}
                desc={i.description}
                status={
                  i.granted
                    ? `Anda setuju sejak ${fmtDate(i.since)} · ${i.child_assent ? "anak sudah asen" : "menunggu asen anak"}`
                    : "Tidak aktif"
                }
                statusOn={i.granted && !!i.child_assent}
                checked={!!choices[i.type]}
                onChange={(v) => setChoices((c) => ({ ...c, [i.type]: v }))}
              />
            ))}
          </section>

          <XaiBox title="Asen anak" tag="Jaminan">
            <p>
              Setelah Anda setuju, {d.child.name.split(" ")[0]} juga ditanya dengan bahasa yang sesuai usianya. Data baru dibaca bila Anda dan anak sama-sama setuju. Anak boleh
              menolak tanpa akibat.
            </p>
          </XaiBox>
          <p className="small">{d.not_shown}</p>

          <label className="check">
            <input type="checkbox" checked={legal} onChange={(e) => setLegal(e.target.checked)} />
            <span>Saya menyatakan sebagai orang tua atau wali sah dari {d.child.name}.</span>
          </label>

          {err && <Banner kind="bad">{err}</Banner>}
          {done && (
            <Banner kind="info">
              <span className="row nowrap-row" style={{ gap: 8 }}>
                <CircleCheck aria-hidden style={{ width: 18, height: 18 }} />
                {done === "setuju" ? "Persetujuan tersimpan. Anda bisa mengubahnya kapan saja di Hak data." : "Tersimpan. Data anak tidak diproses."}
              </span>
            </Banner>
          )}
          <div className="choice-row two">
            <Button variant="ghost" onClick={() => save(false)} loading={busy === "tidak"} disabled={!!busy}>
              Tidak setuju
            </Button>
            <Button onClick={() => save(true)} loading={busy === "setuju"} disabled={!!busy || !legal || !Object.values(choices).some(Boolean)}>
              Setuju
            </Button>
          </div>
          <p className="caption">Tidak setuju tidak membawa akibat apa pun bagi anak. Layanan BK tetap terbuka seperti biasa.</p>

          <section className="section">
            <h2 style={{ fontSize: 17 }}>Hak Anda sebagai wali</h2>
            <ul className="card list">
              {d.rights.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </section>
        </>
      )}
    </>
  );
}
