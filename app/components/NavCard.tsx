import type { NavPoint, PortfolioState } from "@/lib/model/types";

type Props = { state: PortfolioState };

export function NavCard({ state }: Props) {
  const points = state.navSeries;
  if (points.length < 2) return <EmptyCard />;

  const valuePoints: NavPoint[] =
    state.portfolioValueSeries && state.portfolioValueSeries.length >= 2
      ? state.portfolioValueSeries
      : [];

  const allNavs = [
    state.config.seedValue,
    ...points.map((p) => p.nav),
    ...valuePoints.map((p) => p.nav),
  ];
  const minNav = Math.min(...allNavs);
  const maxNav = Math.max(...allNavs);
  const pad = (maxNav - minNav) * 0.1 || 1;
  const yMin = minNav - pad;
  const yMax = maxNav + pad;

  const firstMs = Math.min(
    Date.parse(points[0].date),
    ...(valuePoints.length ? [Date.parse(valuePoints[0].date)] : []),
  );
  const lastMs = Math.max(
    Date.parse(points.at(-1)!.date),
    ...(valuePoints.length ? [Date.parse(valuePoints.at(-1)!.date)] : []),
  );
  const xRange = Math.max(1, lastMs - firstMs);
  const scaleX = (ms: number) => ((ms - firstMs) / xRange) * 600;
  const scaleY = (v: number) => 180 - ((v - yMin) / (yMax - yMin)) * 180;

  function pathOf(series: NavPoint[]): string {
    return series
      .map((p, i) => {
        const x = scaleX(Date.parse(p.date));
        const y = scaleY(p.nav);
        return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");
  }

  const path = pathOf(points);
  const area = `${path} L600,180 L0,180 Z`;
  const valuePath = valuePoints.length ? pathOf(valuePoints) : null;

  const seedY = scaleY(state.config.seedValue);

  const tickCount = Math.min(6, points.length);
  const ticks = Array.from({ length: tickCount }, (_, i) => {
    const idx = Math.floor((i * (points.length - 1)) / (tickCount - 1));
    return points[idx].date.slice(5);
  });

  return (
    <div className="rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4">
      <h3 className="text-sm font-bold uppercase tracking-wide text-gray-700 dark:text-gray-200 mb-0.5">
        NAV over time
      </h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
        Options Income: cash + shares at cost basis, at each trade date.
        {valuePath
          ? " Portfolio Value: cash + shares at daily market close, through T-1."
          : ""}
      </p>
      <div className="h-[180px] relative border-l border-b border-gray-200 dark:border-neutral-800">
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
          {valuePath && (
            <path
              d={valuePath}
              stroke="#8b5cf6"
              strokeWidth="2"
              fill="none"
            />
          )}
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
      <div className="flex justify-between text-[10px] text-gray-400 dark:text-gray-500 mt-1 pl-1">
        {ticks.map((t, i) => (
          <span key={i}>{t}</span>
        ))}
      </div>
      <div className="flex gap-3 text-[11px] text-gray-500 dark:text-gray-400 mt-2">
        <span>
          <span className="inline-block w-2.5 h-2.5 align-middle rounded-sm bg-emerald-600 mr-1" />
          Options Income
        </span>
        {valuePath && (
          <span>
            <span className="inline-block w-2.5 h-2.5 align-middle rounded-sm bg-violet-500 mr-1" />
            Portfolio Value
          </span>
        )}
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
    <div className="rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4">
      <p className="text-sm text-gray-500 dark:text-gray-400">Not enough data points yet.</p>
    </div>
  );
}
