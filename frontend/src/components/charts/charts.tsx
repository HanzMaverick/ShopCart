import { useId, useRef, useState, type ReactNode } from 'react';

/* Graficas ligeras en SVG/CSS: sin libreria de terceros (menos superficie de ataque y de mantenimiento). */

export interface Point { label: string; value: number }

interface TimeSeriesProps {
  data: Point[];
  kind?: 'line' | 'bars';
  format?: (n: number) => string;
  height?: number;
  ariaLabel: string;
}

const W = 640; const PAD = { l: 52, r: 12, t: 12, b: 28 };

function niceMax(max: number): number {
  if (max <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(max));
  const n = max / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

/**Serie temporal (linea con area o columnas) con ejes, cuadricula y tooltip al pasar el cursor o enfocar*/
export function TimeSeriesChart({ data, kind = 'line', format = String, height = 240, ariaLabel }: TimeSeriesProps) {
  const [hover, setHover] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const H = height;
  const innerW = W - PAD.l - PAD.r; const innerH = H - PAD.t - PAD.b;
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const n = data.length;
  const x = (i: number) => PAD.l + (kind === 'bars' ? (innerW / n) * (i + 0.5) : n === 1 ? innerW / 2 : (innerW / (n - 1)) * i);
  const y = (v: number) => PAD.t + innerH - (v / max) * innerH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const step = Math.max(1, Math.ceil(n / 8));
  const barW = Math.max(2, (innerW / Math.max(n, 1)) * 0.7);

  const line = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(' ');
  const area = n > 0 ? `${line} L${x(n - 1).toFixed(1)},${(PAD.t + innerH).toFixed(1)} L${x(0).toFixed(1)},${(PAD.t + innerH).toFixed(1)} Z` : '';

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0; let bestD = Infinity;
    data.forEach((_, i) => { const d = Math.abs(x(i) - px); if (d < bestD) { bestD = d; best = i; } });
    setHover(best);
  };

  if (n === 0) return null;
  const tip = hover !== null ? data[hover] : undefined;

  return (
    <div className="chart-wrap" ref={wrapRef}>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={titleId} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        <title id={titleId}>{ariaLabel}</title>
        {ticks.map((t) => (
          <g key={t}>
            <line className="grid" x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} />
            <text x={PAD.l - 6} y={y(t) + 4} textAnchor="end">{format(t)}</text>
          </g>
        ))}
        {data.map((d, i) => (i % step === 0 || i === n - 1) && (
          <text key={d.label} x={x(i)} y={H - 8} textAnchor="middle">{d.label}</text>
        ))}
        {kind === 'line' ? (
          <>
            <path className="area" d={area} /><path className="line" d={line} />
            {hover !== null && tip && <circle className="dot" cx={x(hover)} cy={y(tip.value)} r={4} />}
          </>
        ) : data.map((d, i) => (
          <rect key={d.label} className="bar" x={x(i) - barW / 2} y={y(d.value)} width={barW} height={Math.max(0, PAD.t + innerH - y(d.value))} rx={2}
                opacity={hover === null || hover === i ? 1 : 0.55} />
        ))}
      </svg>
      {tip && hover !== null && (
        <div className="chart-tip" style={{ left: `${(x(hover) / W) * 100}%`, top: `${(y(tip.value) / H) * 100}%` }}>
          {tip.label}: <strong>{format(tip.value)}</strong>
        </div>
      )}
    </div>
  );
}

export interface BarItem { label: string; value: number; display?: ReactNode }

/**Barras horizontales (categorias, ranking de productos)*/
export function HBarChart({ items, format = String }: { items: BarItem[]; format?: (n: number) => string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div role="list">
      {items.map((it) => (
        <div className="hbar" role="listitem" key={it.label}>
          <span className="name" title={it.label}>{it.label}</span>
          <div className="hbar-track" aria-hidden="true"><div className="hbar-fill" style={{ width: `${(it.value / max) * 100}%` }} /></div>
          <span className="nowrap">{it.display ?? format(it.value)}</span>
        </div>
      ))}
    </div>
  );
}
