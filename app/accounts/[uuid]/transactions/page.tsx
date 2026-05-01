import { notFound } from "next/navigation";
import { loadAccountTransactionsView } from "@/lib/server/accountTransactions";
import { getAccountTabFlags } from "@/lib/server/accountTabs";
import { AccountTabs } from "@/app/components/AccountTabs";
import { TransactionsPageClient } from "@/app/components/TransactionsPageClient";

export const dynamic = "force-dynamic";

export default async function AccountTransactionsPage({
  params,
}: {
  params: Promise<{ uuid: string }>;
}) {
  const { uuid } = await params;
  const [data, flags] = await Promise.all([
    loadAccountTransactionsView(uuid),
    getAccountTabFlags(uuid),
  ]);

  if (data === null) notFound();

  const tabFlags = flags ?? { showOptions: true, showTrades: true };

  return (
    <>
      <AccountTabs uuid={uuid} flags={tabFlags} active="transactions" />
      <main className="min-h-screen p-6 max-w-7xl mx-auto">
        <header className="rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-5 py-4 mb-4">
          <div className="text-xl font-bold">
            {data.account.label} · Transactions
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {data.transactions.length} total
          </div>
        </header>
        <TransactionsPageClient transactions={data.transactions} uuid={uuid} />
      </main>
    </>
  );
}
