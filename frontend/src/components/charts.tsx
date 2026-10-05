import { useEffect, useRef, useState } from "react";

/** Lebar kontainer dalam piksel, agar SVG digambar 1:1 tanpa teks yang ikut membesar. */
function useWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** Grafik tren 120 px (kartu alasan). Segmen pemicu diberi pita kuning dan label teks;
 *  titik terakhir bertanda; ringkasan teks tersedia untuk pembaca layar (PRD 7.7, 7.8). */
export function TrendChart({
  series,
  triggerFrom,
  summary,
  startWeek,
  unit = "",
}: {
  series: number[];
  triggerFrom: number | null;
  summary: string;
  startWeek?: number;
  unit?: string;
  /** Disimpan untuk pemakaian berikutnya (arah "membaik"); label kini selalu di kanan titik. */
  higherIsBetter?: boolean;
}) {
  const [ref, measured] = useWidth<HTMLElement>(320);
  const W = Math.min(measured, 760);
  const H = 120;
  const padX = 14;
  const padRight = 46;
  const padTop = 22;
  const padBottom = 24;
  if (!series.length) return null;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = max - min || 1;
  const x = (i: number) => padX + (i * (W - padX - padRight)) / Math.max(1, series.length - 1);
  const y = (v: number) => padTop + (1 - (v - min) / span) * (H - padTop - padBottom);
  const pts = series.map((v, i) => `${x(i)},${y(v)}`);
  const tf = triggerFrom ?? series.length;
  const before = pts.slice(0, tf + 1).join(" ");
  const after = pts.slice(tf).join(" ");
  const last = series.length - 1;
  const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(0));
  const wk = (i: number) => (startWeek !== undefined ? `P${startWeek + i}` : "");
  return (
    <figure style={{ margin: 0 }} ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={summary} style={{ overflow: "visible", maxWidth: "100%" }}>
        {tf < series.length && (
          <g>
            <rect x={x(tf) - 6} y={4} width={x(last) - x(tf) + 12} height={H - 4 - padBottom + 6} rx={6} fill="var(--warn-soft)" />
            <text x={x(tf) - 2} y={15} fontSize="11" fontWeight="700" fill="var(--warn-text)">
              Yang memicu tanda
            </text>
          </g>
        )}
        <line x1={padX} x2={W - padRight + 8} y1={H - padBottom + 2} y2={H - padBottom + 2} stroke="var(--hairline)" strokeWidth="1" />
        <polyline points={before} fill="none" stroke="var(--line-strong)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {tf < series.length && <polyline points={after} fill="none" stroke="var(--warn-text)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />}
        {series.map((v, i) => (
          <circle key={i} cx={x(i)} cy={y(v)} r={i === last ? 5 : 2.6} fill={i === last ? "var(--warn-text)" : i >= tf ? "var(--warn-text)" : "var(--line-strong)"} stroke={i === last ? "#fff" : "none"} strokeWidth={2} />
        ))}
        <text x={x(0)} y={y(series[0]) - 8} fontSize="12" fill="var(--body)" textAnchor="start">
          {fmt(series[0])}
          {unit}
        </text>
        <text x={x(last) + 11} y={y(series[last]) + 4.5} fontSize="13" fontWeight="700" fill="var(--ink)" textAnchor="start">
          {fmt(series[last])}
          {unit}
        </text>
        {startWeek !== undefined &&
          series.map((_, i) => (
            <text key={i} x={x(i)} y={H - 6} fontSize="10.5" fill="var(--mute)" textAnchor="middle">
              {wk(i)}
            </text>
          ))}
      </svg>
      <figcaption className="sr-only">{summary}</figcaption>
    </figure>
  );
}

/** Garis tren agregat dengan nilai tertulis di titik terakhir. */
export function LineChart({ points, label, color = "var(--primary)", height = 160 }: { points: { label: string; value: number }[]; label: string; color?: string; height?: number }) {
  const W = 560;
  const H = height;
  const padX = 28;
  const padTop = 16;
  const padBottom = 26;
  if (!points.length) return null;
  const max = Math.max(1, ...points.map((p) => p.value));
  const x = (i: number) => padX + (i * (W - padX * 2)) / Math.max(1, points.length - 1);
  const y = (v: number) => padTop + (1 - v / max) * (H - padTop - padBottom);
  const d = points.map((p, i) => `${x(i)},${y(p.value)}`).join(" ");
  const summary = `${label}: ${points.map((p) => `${p.label} ${p.value}`).join(", ")}`;
  const last = points.length - 1;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={summary} style={{ height: "auto" }}>
      {[0, 0.5, 1].map((t) => (
        <g key={t}>
          <line x1={padX} x2={W - padX} y1={y(max * t)} y2={y(max * t)} stroke="var(--hairline)" strokeDasharray={t === 0 ? undefined : "3 4"} />
          <text x={padX - 8} y={y(max * t) + 4} fontSize="11" fill="var(--mute)" textAnchor="end">
            {Math.round(max * t)}
          </text>
        </g>
      ))}
      <polygon points={`${x(0)},${y(0)} ${d} ${x(last)},${y(0)}`} fill={color} fillOpacity={0.08} />
      <polyline points={d} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(p.value)} r={i === last ? 4.5 : 2.5} fill={color} stroke="#fff" strokeWidth={i === last ? 2 : 0} />
          <text x={x(i)} y={H - 7} fontSize="11" fill="var(--mute)" textAnchor="middle">
            {p.label}
          </text>
        </g>
      ))}
      <text x={x(last)} y={y(points[last].value) - 10} fontSize="12.5" fontWeight="700" fill="var(--ink)" textAnchor="end">
        {points[last].value}
      </text>
    </svg>
  );
}

/** Batang horizontal dengan angka tertulis (tanpa pai/radar). */
export function HBar({ label, value, max = 1, display, tone, mark, hint }: { label: string; value: number; max?: number; display: string; tone?: "warn" | "bad" | "xai"; mark?: number; hint?: string }) {
  const w = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={`hbar ${label ? "" : "no-label"}`}>
      {label && (
        <span>
          {label}
          {hint && <span className="caption" style={{ display: "block" }}>{hint}</span>}
        </span>
      )}
      <span className="hbar-track" role="img" aria-label={label ? `${label}: ${display}` : display}>
        <span className={`hbar-fill ${tone ?? ""}`} style={{ width: `${w}%`, display: "block" }} />
        {mark !== undefined && <span className="hbar-mark" style={{ left: `${Math.min(100, (mark / max) * 100)}%` }} />}
      </span>
      <span className="hbar-value">{display}</span>
    </div>
  );
}

/** Batang vertikal bertumpuk kecil untuk tren kasus per pekan. */
export function WeekBars({ data, label }: { data: { label: string; kuning: number; merah: number }[]; label: string }) {
  const W = 560;
  const H = 150;
  const padX = 24;
  const padTop = 14;
  const padBottom = 24;
  const max = Math.max(1, ...data.map((d) => d.kuning + d.merah));
  const bw = (W - padX * 2) / data.length;
  const y = (v: number) => (v / max) * (H - padTop - padBottom);
  const summary = `${label}: ${data.map((d) => `${d.label} ${d.kuning} kuning, ${d.merah} merah`).join("; ")}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={summary} style={{ height: "auto" }}>
      <line x1={padX} x2={W - padX} y1={H - padBottom} y2={H - padBottom} stroke="var(--hairline)" />
      {data.map((d, i) => {
        const x0 = padX + i * bw + bw * 0.22;
        const w = bw * 0.56;
        const hk = y(d.kuning);
        const hm = y(d.merah);
        const base = H - padBottom;
        return (
          <g key={i}>
            <rect x={x0} y={base - hk} width={w} height={hk} rx={3} fill="var(--warn-fill)" />
            <rect x={x0} y={base - hk - hm} width={w} height={hm} rx={3} fill="var(--bad)" />
            {d.kuning + d.merah > 0 && (
              <text x={x0 + w / 2} y={base - hk - hm - 5} fontSize="11.5" fontWeight="700" fill="var(--ink)" textAnchor="middle">
                {d.kuning + d.merah}
              </text>
            )}
            <text x={x0 + w / 2} y={H - 7} fontSize="11" fill="var(--mute)" textAnchor="middle">
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
