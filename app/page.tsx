import { loadDashboard } from "@/lib/server/dashboard";
import { SummaryStrip } from "@/app/components/SummaryStrip";
import { NavCard } from "@/app/components/NavCard";
import { PremiumsCard } from "@/app/components/PremiumsCard";
import { OpenPositionsCard } from "@/app/components/OpenPositionsCard";
import { TransactionLogCard } from "@/app/components/TransactionLogCard";
import { TradeHistoryCard } from "@/app/components/TradeHistoryCard";
import { OnboardingCard } from "@/app/components/OnboardingCard";
import { AttentionBanner } from "@/app/components/AttentionBanner";
import { ReturnMetricsCard } from "@/app/components/ReturnMetricsCard";
import { OutcomesCard } from "@/app/components/OutcomesCard";
import { PremiumByTickerCard } from "@/app/components/PremiumByTickerCard";
import { CashYieldCard } from "@/app/components/CashYieldCard";
import { CapitalAtRiskCard } from "@/app/components/CapitalAtRiskCard";
import { MarkToMarketCard } from "@/app/components/MarkToMarketCard";
import { ProjectionCard } from "@/app/components/ProjectionCard";

export const dynamic = "force-dynamic";

export default async function Home() {
  const data = await loadDashboard();

  if (data.kind === "no-csv") {
    return <OnboardingCard dataDir="data/" missing="csv" />;
  }
  if (data.kind === "no-config") {
    return <OnboardingCard dataDir="data/" missing="config" />;
  }
  if (data.kind === "parse-error") {
    return (
      <div className="max-w-2xl mx-auto mt-16 rounded-lg border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950 p-6">
        <h2 className="text-lg font-semibold text-red-900 dark:text-red-100 mb-2">
          Couldn&rsquo;t parse the CSV
        </h2>
        <pre className="bg-red-100 dark:bg-red-900 text-red-900 dark:text-red-100 text-xs p-3 rounded overflow-x-auto">
          {data.message}
        </pre>
      </div>
    );
  }

  const { state, sourceFiles, loadedAt, markToMarket, projection, latestSnapshot } = data;
  const asOfDate =
    state.navSeries.at(-1)?.date ?? state.config.seedDate;

  return (
    <main className="min-h-screen p-6 max-w-7xl mx-auto">
      <header className="rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-5 py-4 mb-4 flex items-baseline justify-between">
        <div>
          <div className="text-xl font-bold">Demo · Options Income</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Seed ${state.config.seedValue.toLocaleString()} on{" "}
            {state.config.seedDate} · Data through {asOfDate} · Source:{" "}
            <code className="bg-gray-100 dark:bg-neutral-800 px-1 rounded">{sourceFiles.transactions.length} transactions · {sourceFiles.positions.length} positions</code>
          </div>
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400">
          Last refresh {new Date(loadedAt).toLocaleTimeString()}
        </div>
      </header>

      <AttentionBanner warnings={state.warnings} />

      <SummaryStrip state={state} markToMarket={markToMarket} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div className="md:col-span-2">
          <NavCard state={state} />
        </div>
        <div>
          <PremiumsCard state={state} />
        </div>
      </div>

      <div className="mb-4">
        <ProjectionCard
          projection={projection}
          asOfDate={latestSnapshot?.asOf?.slice(0, 10)}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <OpenPositionsCard state={state} asOfDate={asOfDate} />
        <TransactionLogCard transactions={state.transactions} />
      </div>

      <div className="mb-4">
        <TradeHistoryCard state={state} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div className="md:col-span-2">
          <ReturnMetricsCard state={state} />
        </div>
        <div>
          <OutcomesCard state={state} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <PremiumByTickerCard state={state} />
        <CashYieldCard state={state} />
      </div>

      <div className="mb-4">
        <CapitalAtRiskCard state={state} />
      </div>

      {markToMarket !== null && markToMarket.rows.length > 0 && (
        <div className="mb-4">
          <MarkToMarketCard markToMarket={markToMarket} />
        </div>
      )}
    </main>
  );
}
