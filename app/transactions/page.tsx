import { loadDashboard } from "@/lib/server/dashboard";
import { TransactionsPageClient } from "@/app/components/TransactionsPageClient";

export const dynamic = "force-dynamic";

export default async function TransactionsPage() {
  const data = await loadDashboard({ includeMarketData: false });

  if (data.kind === "no-csv" || data.kind === "no-config") {
    return (
      <main className="p-6 max-w-7xl mx-auto">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No data loaded. Head back to the{" "}
          <a href="/" className="underline">dashboard</a> to get started.
        </p>
      </main>
    );
  }
  if (data.kind === "parse-error") {
    return (
      <main className="p-6 max-w-7xl mx-auto">
        <pre className="bg-red-100 dark:bg-red-900 text-red-900 dark:text-red-100 text-xs p-3 rounded overflow-x-auto">
          {data.message}
        </pre>
      </main>
    );
  }

  return (
    <main className="p-6 max-w-7xl mx-auto">
      <TransactionsPageClient transactions={data.state.transactions} />
    </main>
  );
}
