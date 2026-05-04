import type { NavPoint } from "@/lib/model/types";

type Props = {
  points: NavPoint[];
  width?: number;
  height?: number;
  positive?: boolean | null;
  className?: string;
};

export function Sparkline({
  points,
  width = 120,
  height = 32,
  positive = null,
  className,
}: Props) {
  if (points.length < 2) {
    return (
      <div
        className={`text-[10px] text-gray-400 dark:text-gray-500 ${className ?? ""}`}
        style={{ width, height, display: "flex", alignItems: "center", justifyContent: "center" }}
      >
        —
      </div>
    );
  }

  const navs = points.map((p) => p.nav);
  const min = Math.min(...navs);
  const max = Math.max(...navs);
  const span = max - min || 1;
  const firstMs = Date.parse(points[0].date);
  const lastMs = Date.parse(points.at(-1)!.date);
  const xRange = Math.max(1, lastMs - firstMs);

  const stroke =
    positive === true
      ? "#059669"
      : positive === false
        ? "#dc2626"
        : "#6b7280";
  const fillId = `spark-fill-${stroke.slice(1)}`;

  const path = points
    .map((p, i) => {
      const x = ((Date.parse(p.date) - firstMs) / xRange) * width;
      const y = height - ((p.nav - min) / span) * height;
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  const areaPath = `${path} L${width},${height} L0,${height} Z`;

  return (
    <svg
      className={className}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label="NAV trend"
    >
      <defs>
        <linearGradient id={fillId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={stroke} stopOpacity="0.18" />
          <stop offset="1" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${fillId})`} />
      <path d={path} stroke={stroke} strokeWidth={1.5} fill="none" />
    </svg>
  );
}
