import { useParams } from "react-router-dom";
import { PageHead, ErrorState, LoadingBlock } from "../../components/ui";
import { useResource } from "../../lib/api";

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
    </article>
  );
}
