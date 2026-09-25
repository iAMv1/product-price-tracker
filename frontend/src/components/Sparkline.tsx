/**
 * Hand-rolled SVG price sparkline (no chart dependency). Static geometry —
 * nothing to disable under prefers-reduced-motion. Oldest observation left,
 * newest right; min/max labelled so the shape is honestly scaled.
 */
export function Sparkline({ prices }: { prices: number[] }) {
  if (prices.length < 2) return null;
  const width = 220;
  const height = 48;
  const pad = 4;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = max - min || 1;
  const step = (width - pad * 2) / (prices.length - 1);
  const points = prices.map((price, i) => {
    const x = pad + i * step;
    const y = height - pad - ((price - min) / span) * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const last = points[points.length - 1]?.split(',').map(Number) ?? [0, 0];

  return (
    <figure className="sparkline" aria-label={`Price trend from ${min} to ${max}`}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-hidden>
        <polyline points={points.join(' ')} className="spark-line" />
        <circle cx={last[0]} cy={last[1]} r={3} className="spark-dot" />
      </svg>
      <figcaption className="muted">
        min {min} · max {max}
      </figcaption>
    </figure>
  );
}
