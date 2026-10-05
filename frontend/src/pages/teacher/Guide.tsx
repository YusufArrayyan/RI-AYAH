import { Check, X } from "lucide-react";
import { Link } from "react-router-dom";
import { Banner, ErrorState, LoadingBlock, PageHead } from "../../components/ui";
import { useResource } from "../../lib/api";

interface Guide {
  reviewed: boolean;
  try: { say: string; why: string }[];
  avoid: { say: string; why: string }[];
  after: string[];
}

/** G3 Panduan menyapa. */
export default function TeacherGuide() {
  const { data, error, loading, reload } = useResource<Guide>("/api/teacher/guide");
  return (
    <>
      <PageHead title="Panduan memulai obrolan" sub="Kalimat yang menenangkan untuk membuka obrolan. Obrolan terbaik terdengar seperti Anda sendiri, bukan seperti membaca naskah." />
      {loading && !data && <LoadingBlock />}
      {error && !data && <ErrorState error={error} onRetry={reload} />}
      {data && (
        <div className="stack" style={{ gap: 20 }}>
          {!data.reviewed && <Banner kind="warn">Isi panduan ini masih draf dan belum ditinjau psikolog. Pada rilis, panduan baru terbit setelah ditinjau.</Banner>}
          <div className="layout-2col even">
            <section className="card stack" aria-labelledby="coba">
              <h2 id="coba" className="row nowrap-row" style={{ gap: 8 }}>
                <span className="chip chip-ok">
                  <Check aria-hidden /> Cobalah
                </span>
              </h2>
              <ul className="list">
                {data.try.map((t) => (
                  <li key={t.say}>
                    <p className="strong" style={{ fontSize: 16.5 }}>
                      {t.say}
                    </p>
                    <p className="small muted">{t.why}</p>
                  </li>
                ))}
              </ul>
            </section>
            <section className="card stack" aria-labelledby="hindari">
              <h2 id="hindari" className="row nowrap-row" style={{ gap: 8 }}>
                <span className="chip chip-bad">
                  <X aria-hidden /> Hindari
                </span>
              </h2>
              <ul className="list">
                {data.avoid.map((t) => (
                  <li key={t.say}>
                    <p className="strong" style={{ fontSize: 16.5 }}>
                      {t.say}
                    </p>
                    <p className="small muted">{t.why}</p>
                  </li>
                ))}
              </ul>
            </section>
          </div>
          <section className="card stack" aria-labelledby="setelah">
            <h2 id="setelah">Setelah ngobrol</h2>
            <ol className="stack" style={{ margin: 0, paddingLeft: "1.3em", gap: 10 }}>
              {data.after.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ol>
          </section>
          <Link to="/guru" className="btn btn-ghost" style={{ alignSelf: "flex-start" }}>
            Kembali ke daftar siswa
          </Link>
        </div>
      )}
    </>
  );
}
