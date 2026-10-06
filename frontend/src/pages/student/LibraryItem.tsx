import { ExternalLink } from "lucide-react";
import { useParams } from "react-router-dom";
import { PageHead, ErrorState, LoadingBlock } from "../../components/ui";
import { useResource } from "../../lib/api";

interface Dalil {
  jenis: "ayat" | "hadis";
  arab: string;
  latin: string | null;
  terjemah: string;
  rujukan: string;
  derajat: string | null;
  sumber: string;
  url: string;
  pelajaran: string[];
}

interface Item {
  id: number;
  title: string;
  kind: string;
  category: string;
  source: string;
  label: string;
  minutes: number;
  summary: string;
  body: string;
  reviewed_by: string | null;
  dalil: Dalil[];
}

function DalilCard({ d }: { d: Dalil }) {
  const hadis = d.jenis === "hadis";
  return (
    <li className={`card dalil${hadis ? " hadis" : ""}`}>
      <div className="row">
        <span className={`chip ${hadis ? "chip-xai" : "chip-info"}`}>{hadis ? "Hadis" : "Al-Qur'an"}</span>
        <span className="strong">{d.rujukan}</span>
        {d.derajat && <span className="chip chip-ok">{d.derajat}</span>}
      </div>
      <p className="dalil-ar" lang="ar" dir="rtl">
        {d.arab}
      </p>
      {d.latin && <p className="dalil-latin">{d.latin}</p>}
      <p className="dalil-tr">{hadis ? d.terjemah : `“${d.terjemah}”`}</p>
      {d.pelajaran.length > 0 && (
        <div className="dalil-lessons">
          <span className="strong">Anjuran dan pelajaran dari hadis ini</span>
          <ul>
            {d.pelajaran.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      )}
      <a className="caption dalil-src" href={d.url} target="_blank" rel="noopener noreferrer">
        Sumber: {d.sumber} <ExternalLink aria-hidden />
        <span className="sr-only">(buka di tab baru)</span>
      </a>
    </li>
  );
}

export default function LibraryItem() {
  const { id } = useParams();
  const { data, error, loading, reload } = useResource<Item>(`/api/library/${id}`);
  if (loading && !data) return <LoadingBlock label="Memuat konten" />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;
  return (
    <article className="stack" style={{ gap: 14 }}>
      <PageHead title={data.title} back={{ to: "/siswa/pustaka", label: "Bacaan" }} sub={data.summary} />
      <div className="row">
        <span className="chip chip-info">{data.label}</span>
        <span className="chip chip-neutral">{data.category}</span>
        <span className="caption">{data.minutes} menit</span>
      </div>
      <div className="card stack" style={{ gap: 12, fontSize: 17, lineHeight: 1.65 }}>
        {data.body.split("\n\n").map((p, i) => (
          <p key={i} style={{ maxWidth: "65ch" }}>
            {p}
          </p>
        ))}
      </div>
      <p className="caption">
        Sumber: {data.source}
        {data.reviewed_by ? ` · Ditinjau ${data.reviewed_by}` : ""}
      </p>

      {data.dalil.length > 0 && (
        <section className="section stack" style={{ gap: 12 }} aria-labelledby="dalil-title">
          <div>
            <h2 id="dalil-title" style={{ fontSize: 20 }}>
              Dalil dan anjuran Islam
            </h2>
            <p className="muted" style={{ maxWidth: "65ch" }}>
              Ayat dan hadis dikutip apa adanya dari Al-Qur'an dan Terjemahan Kemenag RI serta Ensiklopedia Hadis Terjemahan (HadeethEnc.com). Ketuk tautan sumber untuk membaca
              teks lengkap dan penjelasannya.
            </p>
          </div>
          <ul className="dalil-list" role="list">
            {data.dalil.map((d, i) => (
              <DalilCard key={i} d={d} />
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
