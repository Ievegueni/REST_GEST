import { useEffect, useId, useRef, useState } from 'react';

export type Series = { name: string; values: number[]; color: string };

const H = 260;
const PAD = { top: 12, right: 12, bottom: 28, left: 56 };

/** Curva suave (Catmull-Rom → Bézier) pelos pontos. */
function smooth(pts: [number, number][], floor: number) {
  if (pts.length < 2) return pts.length ? `M${pts[0]![0]},${pts[0]![1]}` : '';
  let d = `M${pts[0]![0]},${pts[0]![1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const [p0, p1, p2, p3] = [
      pts[i - 1] ?? pts[i]!,
      pts[i]!,
      pts[i + 1]!,
      pts[i + 2] ?? pts[i + 1]!,
    ];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0]},${Math.min(floor, c1[1]!)} ${c2[0]},${Math.min(floor, c2[1]!)} ${p2[0]},${p2[1]}`;
  }
  return d;
}

/** Escala "redonda" para o eixo Y (4 divisões). */
function niceMax(v: number) {
  if (v <= 0) return 4;
  const step = 10 ** Math.floor(Math.log10(v / 4));
  const n = [1, 2, 2.5, 5, 10].find((m) => v / 4 <= m * step)! * step;
  return n * 4;
}

const compact = (v: number) =>
  new Intl.NumberFormat('pt-AO', { notation: 'compact', maximumFractionDigits: 1 }).format(v);

/** Gráfico de área com grelha, eixos e tooltip (SVG, sem dependências). */
export function AreaChart(props: {
  labels: string[];
  series: Series[];
  format?: (v: number) => string;
  /** mostra uma etiqueta do eixo X a cada N pontos */
  every?: number;
}) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  // largura real do contentor: o texto do SVG fica sempre com o mesmo tamanho
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(720);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e!.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const n = props.labels.length;
  const all = props.series.flatMap((s) => s.values);
  const max = niceMax(Math.max(0, ...all));
  const lo = Math.min(0, ...all) < 0 ? -niceMax(-Math.min(...all)) : 0;
  const x = (i: number) => PAD.left + (n <= 1 ? 0 : (i / (n - 1)) * (W - PAD.left - PAD.right));
  const y = (v: number) => PAD.top + ((max - v) / (max - lo)) * (H - PAD.top - PAD.bottom);
  const fmt = props.format ?? ((v: number) => v.toLocaleString('pt-AO'));
  const every = props.every ?? Math.max(1, Math.ceil(n / Math.max(3, Math.floor(W / 90))));

  return (
    <div className="relative" ref={box}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        className="block max-w-full"
        role="img"
        aria-label={props.series.map((s) => s.name).join(', ')}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          const i = Math.round(((px - PAD.left) / (W - PAD.left - PAD.right)) * (n - 1));
          setHover(i >= 0 && i < n ? i : null);
        }}
      >
        <defs>
          {props.series.map((s, k) => (
            <linearGradient key={k} id={`${id}-g${k}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="0.18" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        {/* grelha + eixo Y */}
        {[0, 1, 2, 3, 4].map((k) => {
          const v = lo + ((max - lo) / 4) * k;
          return (
            <g key={k}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={y(v)}
                y2={y(v)}
                stroke="#e5e7eb"
                strokeDasharray={v === 0 ? undefined : '3 4'}
              />
              <text
                x={PAD.left - 8}
                y={y(v) + 4}
                textAnchor="end"
                className="fill-gray-400 text-[11px]"
              >
                {compact(v)}
              </text>
            </g>
          );
        })}
        {/* eixo X */}
        {props.labels.map((l, i) =>
          (i % every === 0 && n - 1 - i >= every / 2) || i === n - 1 ? (
            <text
              key={i}
              x={x(i)}
              y={H - 8}
              textAnchor="middle"
              className="fill-gray-400 text-[11px]"
            >
              {l}
            </text>
          ) : null,
        )}
        {props.series.map((s, k) => {
          const pts = s.values.map((v, i) => [x(i), y(v)] as [number, number]);
          const line = smooth(pts, y(lo));
          return (
            <g key={k}>
              <path
                d={`${line} L${x(n - 1)},${y(0)} L${x(0)},${y(0)} Z`}
                fill={`url(#${id}-g${k})`}
              />
              <path d={line} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" />
            </g>
          );
        })}
        {hover != null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={y(0)} stroke="#c7d2fe" />
            {props.series.map((s, k) => (
              <circle
                key={k}
                cx={x(hover)}
                cy={y(s.values[hover] ?? 0)}
                r="4"
                fill="white"
                stroke={s.color}
                strokeWidth="2"
              />
            ))}
          </g>
        )}
      </svg>
      {hover != null && (
        <div
          className="pointer-events-none absolute top-2 z-10 rounded-lg border bg-white px-3 py-2 text-xs shadow-lg"
          style={{
            left: `${(x(hover) / W) * 100}%`,
            transform: `translateX(${x(hover) > W * 0.7 ? '-105%' : '8%'})`,
          }}
        >
          <div className="mb-1 font-medium text-gray-700">{props.labels[hover]}</div>
          {props.series.map((s, k) => (
            <div key={k} className="flex items-center gap-2 whitespace-nowrap">
              <span className="size-2 rounded-full" style={{ background: s.color }} />
              <span className="text-gray-500">{s.name}</span>
              <span className="ml-auto font-semibold tabular-nums">
                {fmt(s.values[hover] ?? 0)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
