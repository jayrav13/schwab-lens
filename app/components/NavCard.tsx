"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { NavPoint, PortfolioState } from "@/lib/model/types";
import {
  computeYRange,
  filterSeriesByRange,
  nearestPointByMs,
  type RangePreset,
} from "@/lib/model/chart";

type Props = { state: PortfolioState };

type SeriesKey = "incomeSeries" | "valueSeries" | "benchmarkSeries";

type SeriesDef = {
  key: SeriesKey;
  label: string;
  color: string;
  dash?: string;
  points: NavPoint[];
};

const RANGE_PRESETS: RangePreset[] = ["1M", "3M", "6M", "YTD", "All"];
const CHART_W = 600;
const CHART_H = 180;

export function NavCard({ state }: Props) {
  const [range, setRange] = useState<RangePreset>("All");
  const [hidden, setHidden] = useState<Set<SeriesKey>>(() => new Set());
  const [pinned, setPinned] = useState<{ xMs: number } | null>(null);
  const [hoverXMs, setHoverXMs] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Suppress unused-variable lint noise until Task 5/6 wire these up.
  void pinned;
  void setPinned;
  void hoverXMs;
  void setHoverXMs;
  void nearestPointByMs;

  const seriesDefs: SeriesDef[] = useMemo(() => {
    const out: SeriesDef[] = [];
    if (state.navSeries.length >= 2) {
      out.push({
        key: "incomeSeries",
        label: "Options Income",
        color: "#059669",
        points: state.navSeries,
      });
    }
    if (state.portfolioValueSeries && state.portfolioValueSeries.length >= 2) {
      out.push({
        key: "valueSeries",
        label: "Portfolio Value",
        color: "#8b5cf6",
        points: state.portfolioValueSeries,
      });
    }
    if (
      state.benchmarkSeries &&
      state.benchmarkSeries.length >= 2 &&
      state.benchmarkTicker
    ) {
      out.push({
        key: "benchmarkSeries",
        label: `${state.benchmarkTicker} (normalized)`,
        color: "#6b7280",
        dash: "5 3",
        points: state.benchmarkSeries,
      });
    }
    return out;
  }, [
    state.navSeries,
    state.portfolioValueSeries,
    state.benchmarkSeries,
    state.benchmarkTicker,
  ]);

  const asOfDate = useMemo(() => {
    const dates = seriesDefs.flatMap((s) => s.points.map((p) => p.date));
    return dates.length > 0 ? dates.sort().at(-1)! : state.config.seedDate;
  }, [seriesDefs, state.config.seedDate]);

  const visibleDefs = seriesDefs.filter((s) => !hidden.has(s.key));

  const drawable = visibleDefs
    .map((s) => ({ def: s, points: filterSeriesByRange(s.points, range, asOfDate) }))
    .filter((s) => s.points.length >= 2);

  const { yMin, yMax } = computeYRange(
    drawable.map((s) => s.points),
    state.config.seedValue,
  );

  const allMs = drawable.flatMap((s) => s.points.map((p) => Date.parse(p.date)));
  const firstMs = allMs.length ? Math.min(...allMs) : 0;
  const lastMs = allMs.length ? Math.max(...allMs) : 1;
  const xRange = Math.max(1, lastMs - firstMs);

  const scaleX = (ms: number) => ((ms - firstMs) / xRange) * CHART_W;
  const scaleY = (v: number) => CHART_H - ((v - yMin) / (yMax - yMin || 1)) * CHART_H;

  const pathOf = (series: NavPoint[]): string =>
    series
      .map((p, i) => {
        const x = scaleX(Date.parse(p.date));
        const y = scaleY(p.nav);
        return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");

  const incomeDraw = drawable.find((s) => s.def.key === "incomeSeries");
  const seedY = scaleY(state.config.seedValue);

  const tickSource = incomeDraw?.points ?? drawable[0]?.points ?? [];
  const tickCount = Math.min(6, Math.max(0, tickSource.length));
  const ticks =
    tickCount >= 2
      ? Array.from({ length: tickCount }, (_, i) => {
          const idx = Math.floor((i * (tickSource.length - 1)) / (tickCount - 1));
          return tickSource[idx].date.slice(5);
        })
      : [];

  const toggle = useCallback(
    (key: SeriesKey) => {
      setHidden((prev) => {
        if (prev.has(key)) {
          const next = new Set(prev);
          next.delete(key);
          return next;
        }
        const wouldHide = new Set(prev);
        wouldHide.add(key);
        const visibleAfter = seriesDefs
          .map((s) => s.key)
          .filter((k) => !wouldHide.has(k));
        if (visibleAfter.length === 0) return prev;
        return wouldHide;
      });
    },
    [seriesDefs],
  );

  // Placeholder effect slot — Task 6 replaces with outside-tap-clears-pinned.
  useEffect(() => {
    return;
  }, []);

  if (state.navSeries.length < 2) return <EmptyCard />;

  const valueDraw = drawable.find((s) => s.def.key === "valueSeries");
  const benchmarkDraw = drawable.find((s) => s.def.key === "benchmarkSeries");

  return (
    <div className="rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4">
      <h3 className="text-sm font-bold uppercase tracking-wide text-gray-700 dark:text-gray-200 mb-0.5">
        NAV over time
      </h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
        Options Income: cash + shares at cost basis, at each trade date.
        {valueDraw ? " Portfolio Value: cash + shares at daily market close, through T-1." : ""}
        {benchmarkDraw && state.benchmarkTicker
          ? ` ${state.benchmarkTicker} (normalized): starts at seed value, grows by index return.`
          : ""}
      </p>

      <div className="flex gap-1.5 mb-3">
        {RANGE_PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setRange(p)}
            className={`text-[11px] px-2 py-0.5 rounded border ${
              range === p
                ? "bg-gray-900 text-white border-gray-900 dark:bg-gray-100 dark:text-gray-900 dark:border-gray-100"
                : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50 dark:bg-neutral-900 dark:text-gray-300 dark:border-neutral-700 dark:hover:bg-neutral-800"
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      <div
        ref={containerRef}
        className="h-[180px] relative border-l border-b border-gray-200 dark:border-neutral-800"
      >
        <svg
          className="absolute inset-0"
          viewBox={`0 0 ${CHART_W} ${CHART_H}`}
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
          {incomeDraw && (
            <path
              d={`${pathOf(incomeDraw.points)} L${CHART_W},${CHART_H} L0,${CHART_H} Z`}
              fill="url(#nav-gradient)"
            />
          )}
          {drawable.map((s) => (
            <path
              key={s.def.key}
              d={pathOf(s.points)}
              stroke={s.def.color}
              strokeWidth={2}
              strokeDasharray={s.def.dash}
              fill="none"
            />
          ))}
          <line
            x1="0"
            y1={seedY}
            x2={CHART_W}
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

      <div className="flex flex-wrap gap-3 text-[11px] text-gray-500 dark:text-gray-400 mt-2">
        {seriesDefs.map((s) => {
          const isHidden = hidden.has(s.key);
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => toggle(s.key)}
              className={`inline-flex items-center ${isHidden ? "opacity-40" : ""}`}
            >
              <span
                className="inline-block w-2.5 h-2.5 align-middle rounded-sm mr-1"
                style={{ backgroundColor: s.color }}
              />
              {s.label}
            </button>
          );
        })}
        <span className="inline-flex items-center">
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
