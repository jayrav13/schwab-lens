import { notFound } from "next/navigation";
import { loadAccountOptionsView } from "@/lib/server/account";
import { getAccountTabFlags } from "@/lib/server/accountTabs";
import { AccountTabs } from "@/app/components/AccountTabs";
import { AttentionBanner } from "@/app/components/AttentionBanner";
import { SummaryStrip } from "@/app/components/SummaryStrip";
import { NavCard } from "@/app/components/NavCard";
import { PremiumsCard } from "@/app/components/PremiumsCard";
import { OpenPositionsCard } from "@/app/components/OpenPositionsCard";
import { TransactionLogCard } from "@/app/components/TransactionLogCard";
import { TradeHistoryCard } from "@/app/components/TradeHistoryCard";
import { ReturnMetricsCard } from "@/app/components/ReturnMetricsCard";
import { OutcomesCard } from "@/app/components/OutcomesCard";
import { PremiumByTickerCard } from "@/app/components/PremiumByTickerCard";
import { CashYieldCard } from "@/app/components/CashYieldCard";
import { CapitalAtRiskCard } from "@/app/components/CapitalAtRiskCard";
import { MarkToMarketCard } from "@/app/components/MarkToMarketCard";

export const dynamic = "force-dynamic";

export default async function AccountOptionsPage({
  params,
}: {
  params: Promise<{ uuid: string }>;
}) {
  const { uuid } = await params;
  const [data, flags] = await Promise.all([
    loadAccountOptionsView(uuid),
    getAccountTabFlags(uuid),
  ]);

  if (data === null) notFound();

  const tabFlags = flags ?? { showOptions: true, showTrades: true };

  if (data.kind === "no-data") {
    return (
      <>
        <AccountTabs uuid={uuid} flags={tabFlags} active="options" />
        <main className="min-h-screen p-6 max-w-7xl mx-auto">
          <header className="rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-5 py-4 mb-4">
            <div className="text-xl font-bold">{data.account.label}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              No transactions or position snapshots yet for this account.
            </div>
          </header>
        </main>
      </>
    );
  }

  const { account, state, sourceFiles, loadedAt, markToMarket } = data;
  const asOfDate = state.navSeries.at(-1)?.date ?? state.config.seedDate;

  return (
    <>
    <AccountTabs uuid={uuid} flags={tabFlags} active="options" />
    <main className="min-h-screen p-6 max-w-7xl mx-auto">
      <header className="rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-5 py-4 mb-4 flex items-baseline justify-between">
        <div>
          <div className="text-xl font-bold">{account.label} · Options</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Seed ${state.config.seedValue.toLocaleString()} on{" "}
            {state.config.seedDate} · Data through {asOfDate} · Source:{" "}
            <code className="bg-gray-100 dark:bg-neutral-800 px-1 rounded">
              {sourceFiles.transactions.length} transactions ·{" "}
              {sourceFiles.positions.length} positions
            </code>
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
    </>
  );
}
