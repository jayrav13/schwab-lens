import type { PortfolioState } from "@/lib/model/types";

type Props = { state: PortfolioState };

export function NavCard({ state }: Props) {
  const points = state.navSeries;
  if (points.length < 2) return <EmptyCard />;

  const minNav = Math.min(state.config.seedValue, ...points.map((p) => p.nav));
  const maxNav = Math.max(state.config.seedValue, ...points.map((p) => p.nav));
  const pad = (maxNav - minNav) * 0.1 || 1;
  const yMin = minNav - pad;
  const yMax = maxNav + pad;

  const firstMs = Date.parse(points[0].date);
  const lastMs = Date.parse(points.at(-1)!.date);
  const xRange = Math.max(1, lastMs - firstMs);
  const scaleX = (ms: number) => ((ms - firstMs) / xRange) * 600;
  const scaleY = (v: number) => 180 - ((v - yMin) / (yMax - yMin)) * 180;

  const path = points
    .map((p, i) => {
      const x = scaleX(Date.parse(p.date));
      const y = scaleY(p.nav);
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  const area = `${path} L600,180 L0,180 Z`;

  const seedY = scaleY(state.config.seedValue);

  const tickCount = Math.min(6, points.length);
  const ticks = Array.from({ length: tickCount }, (_, i) => {
    const idx = Math.floor((i * (points.length - 1)) / (tickCount - 1));
    return points[idx].date.slice(5);
  });

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="text-sm font-bold uppercase tracking-wide text-gray-700 mb-0.5">
        Options Income — NAV
      </h3>
      <p className="text-xs text-gray-500 mb-4">
        Cash + shares at cost basis, less external flows. Point at each
        transaction date.
      </p>
      <div className="h-[180px] relative border-l border-b border-gray-200">
        <svg
          className="absolute inset-0"
          viewBox="0 0 600 180"
          preserveAspectRatio="none"
          width="100%"
          height="100%"
        >
          <defs>
            <linearGradient id="nav-gradient" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#059669" stopOpacity="0.25" />
              <stop offset="1" stopColor="#059669" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill="url(#nav-gradient)" />
          <path d={path} stroke="#059669" strokeWidth="2" fill="none" />
          <line
            x1="0"
            y1={seedY}
            x2="600"
            y2={seedY}
            stroke="#9ca3af"
            strokeDasharray="3,3"
          />
        </svg>
      </div>
      <div className="flex justify-between text-[10px] text-gray-400 mt-1 pl-1">
        {ticks.map((t, i) => (
          <span key={i}>{t}</span>
        ))}
      </div>
      <div className="flex gap-3 text-[11px] text-gray-500 mt-2">
        <span>
          <span className="inline-block w-2.5 h-2.5 align-middle rounded-sm bg-emerald-600 mr-1" />
          NAV
        </span>
        <span>
          <span className="inline-block w-2.5 h-2.5 align-middle rounded-sm bg-gray-400 mr-1" />
          Seed (${state.config.seedValue.toLocaleString()})
        </span>
      </div>
    </div>
  );
}

function EmptyCard() {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-sm text-gray-500">Not enough data points yet.</p>
    </div>
  );
}
