import type { DashboardProjection } from "@/lib/server/dashboard";

type Props = {
  projection: DashboardProjection;
  asOfDate?: string;
};

function fmtCurrency(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function fmtPercent(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function fmtPrettyDate(yyyymmdd: string): string {
  const [y, m, d] = yyyymmdd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function ProjectionCard({ projection, asOfDate }: Props) {
  const containerCls =
    "rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6";

  if (projection.kind === "unconfigured") {
    const missing = projection.reason === "missing-rate" ? "growth rate" : "target";
    return (
      <div className={containerCls}>
        <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
          Projection
        </h3>
        <p className="text-gray-700 dark:text-gray-200">
          Set a {missing} to project years to freedom.
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
          Run <code>/account-set</code> or{" "}
          <code>
            npm run account:configure -- --account=&lt;id&gt;
            --expected-real-return=0.07 --target=1000000
          </code>
          .
        </p>
      </div>
    );
  }

  if (projection.kind === "achieved") {
    return (
      <div className={containerCls}>
        <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
          Projection
        </h3>
        <p className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-1">
          Target reached.
        </p>
        <p className="text-gray-700 dark:text-gray-200">
          Current NAV {fmtCurrency(projection.currentNav)} is past target{" "}
          {fmtCurrency(projection.targetValue)}.
        </p>
      </div>
    );
  }

  if (projection.kind === "unreachable") {
    const message =
      projection.reason === "non-positive-rate"
        ? "Cannot project: rate must be positive."
        : "Cannot project: target and current NAV must be positive.";
    return (
      <div className={containerCls}>
        <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
          Projection
        </h3>
        <p className="text-gray-700 dark:text-gray-200">{message}</p>
      </div>
    );
  }

  // computed
  return (
    <div className={containerCls}>
      <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
        Projection
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Years to target</p>
          <p className="text-3xl font-semibold text-gray-900 dark:text-gray-100">
            {projection.years.toFixed(1)} years
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            at {fmtPercent(projection.rate)} real
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
            Reach {fmtCurrency(projection.targetValue)} by
          </p>
          <p className="text-3xl font-semibold text-gray-900 dark:text-gray-100">
            {fmtPrettyDate(projection.targetDate)}
          </p>
        </div>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-4">
        Current NAV {fmtCurrency(projection.currentNav)}
        {asOfDate ? ` as of ${fmtPrettyDate(asOfDate)}` : ""}.
      </p>
    </div>
  );
}
