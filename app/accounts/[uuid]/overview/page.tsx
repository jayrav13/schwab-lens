import { notFound } from "next/navigation";
import { loadAccountOverviewView } from "@/lib/server/accountOverview";
import { getAccountTabFlags } from "@/lib/server/accountTabs";
import { AccountTabs } from "@/app/components/AccountTabs";
import { AttentionBanner } from "@/app/components/AttentionBanner";
import { OverviewNavStrip } from "@/app/components/OverviewNavStrip";
import { HoldingsTable } from "@/app/components/HoldingsTable";
import { RecentTransactionsTable } from "@/app/components/RecentTransactionsTable";
import { AllocationBar } from "@/app/components/AllocationBar";
import { parsePeriodKey } from "@/lib/server/period";

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

  return (
    <>
      <AccountTabs uuid={uuid} flags={tabFlags} active="overview" />
      <main className="min-h-screen p-6 max-w-7xl mx-auto">
        <AttentionBanner warnings={data.warnings} />
        <OverviewNavStrip uuid={uuid} label={data.account.label} nav={data.nav} />
        <HoldingsTable rows={data.holdings} />
        <RecentTransactionsTable
          uuid={uuid}
          transactions={data.recentTransactions}
        />
        <AllocationBar
          bar={data.allocation.bar}
          equityRows={data.allocation.equityRows}
        />
      </main>
    </>
  );
}
