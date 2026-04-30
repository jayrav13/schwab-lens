import { notFound } from "next/navigation";
import { loadAccountOverviewView } from "@/lib/server/accountOverview";
import { getAccountTabFlags } from "@/lib/server/accountTabs";
import { AccountTabs } from "@/app/components/AccountTabs";
import { AttentionBanner } from "@/app/components/AttentionBanner";
import { OverviewSummaryStrip } from "@/app/components/OverviewSummaryStrip";
import { OverviewPeriodSelector } from "@/app/components/OverviewPeriodSelector";
import { HoldingsTable } from "@/app/components/HoldingsTable";
import { TransactionLogCard } from "@/app/components/TransactionLogCard";
import { AllocationBar } from "@/app/components/AllocationBar";
import { parsePeriodKey } from "@/lib/server/period";
import { formatCurrency } from "@/lib/util/money";

export const dynamic = "force-dynamic";

export default async function AccountOverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ uuid: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const { uuid } = await params;
  const { period: periodParam } = await searchParams;
  const period = parsePeriodKey(periodParam);

  const [data, flags] = await Promise.all([
    loadAccountOverviewView(uuid, { period }),
    getAccountTabFlags(uuid),
  ]);

  if (data === null) notFound();

  const tabFlags = flags ?? { showOptions: false, showTrades: false };

  if (data.kind === "no-data") {
    return (
      <>
        <AccountTabs uuid={uuid} flags={tabFlags} active="overview" />
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

  const cashSlice = data.allocation.bar.find((s) => s.bucket === "CASH");
  const cash = cashSlice?.value ?? 0;
  const { computation } = data.nav;

  return (
    <>
      <AccountTabs uuid={uuid} flags={tabFlags} active="overview" />
      <main className="min-h-screen p-6 max-w-7xl mx-auto">
        <header className="rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-5 py-4 mb-4 flex items-baseline justify-between">
          <div>
            <div className="text-xl font-bold">{data.account.label} · Overview</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Seed {formatCurrency(computation.seedValue)} on {computation.seedDate || "—"} ·
              Data through {data.dataThroughDate} · Source:{" "}
              <code className="bg-gray-100 dark:bg-neutral-800 px-1 rounded">
                {data.sourceFiles.transactions.length} transactions ·{" "}
                {data.sourceFiles.positions.length} positions
              </code>
            </div>
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Last refresh {new Date(data.loadedAt).toLocaleTimeString()}
          </div>
        </header>

        <AttentionBanner warnings={data.warnings} />

        <OverviewSummaryStrip
          nav={data.nav}
          cash={cash}
          holdingsCount={data.holdings.length}
        />

        <OverviewPeriodSelector uuid={uuid} nav={data.nav} />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div className="md:col-span-2">
            <HoldingsTable rows={data.holdings} />
          </div>
          <div>
            <TransactionLogCard
              transactions={data.transactions}
              viewAllHref={`/accounts/${uuid}/transactions`}
            />
          </div>
        </div>

        <AllocationBar
          bar={data.allocation.bar}
          equityRows={data.allocation.equityRows}
        />
      </main>
    </>
  );
}
