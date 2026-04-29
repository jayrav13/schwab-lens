import Link from "next/link";
import { loadHome } from "@/lib/server/home";
import { OnboardingCard } from "@/app/components/OnboardingCard";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { accounts, loadedAt } = await loadHome();

  if (accounts.length === 0) {
    return <OnboardingCard dataDir="data/" />;
  }

  return (
    <main className="min-h-screen p-6 max-w-7xl mx-auto">
      <header className="rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-5 py-4 mb-6 flex items-baseline justify-between">
        <div>
          <div className="text-xl font-bold">Accounts</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {accounts.length} account{accounts.length === 1 ? "" : "s"} ingested
          </div>
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400">
          Last refresh {new Date(loadedAt).toLocaleTimeString()}
        </div>
      </header>

      <ul className="space-y-2">
        {accounts.map((a) => (
          <li
            key={a.uuid}
            className="rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-5 py-4"
          >
            <div className="flex items-baseline justify-between gap-4">
              <div className="min-w-0">
                <Link
                  href={`/accounts/${a.uuid}/overview`}
                  className="text-base font-semibold text-gray-900 dark:text-gray-100 hover:underline"
                >
                  {a.label}
                </Link>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Last seen {new Date(a.lastSeenAt).toLocaleDateString()}
                </div>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Link
                  href={`/accounts/${a.uuid}/overview`}
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Overview
                </Link>
                <Link
                  href={`/accounts/${a.uuid}/options`}
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Options
                </Link>
                <Link
                  href={`/accounts/${a.uuid}/trades`}
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Trades
                </Link>
                <Link
                  href={`/accounts/${a.uuid}/transactions`}
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Transactions
                </Link>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
