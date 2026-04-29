import Link from "next/link";
import type { Transaction } from "@/lib/csv/types";

function fmtMoney(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

function symbolOf(tx: Transaction): string {
  if (tx.option) {
    const { ticker, expiry, strike, type } = tx.option;
    const cp = type === "Call" ? "C" : "P";
    return `${ticker} ${expiry} ${strike}${cp}`;
  }
  return tx.ticker ?? "—";
}

export function RecentTransactionsTable({
  uuid,
  transactions,
}: {
  uuid: string;
  transactions: Transaction[];
}) {
  if (transactions.length === 0) {
    return (
      <section className="rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-5 py-4 mb-4">
        <h2 className="text-sm font-semibold mb-2">Recent transactions</h2>
        <div className="text-sm text-gray-500">No transactions yet.</div>
      </section>
    );
  }
  return (
    <section className="rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-5 py-4 mb-4 overflow-x-auto">
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-sm font-semibold">Recent transactions</h2>
        <Link
          href={`/accounts/${uuid}/transactions`}
          className="text-xs text-blue-600 hover:underline"
        >
          View all →
        </Link>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase text-gray-500 dark:text-gray-400">
            <th className="py-1 pr-3">Date</th>
            <th className="py-1 pr-3">Action</th>
            <th className="py-1 pr-3">Symbol</th>
            <th className="py-1 pr-3 text-right">Qty</th>
            <th className="py-1 pr-3 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((tx, i) => (
            <tr
              key={`${tx.tradeDate}-${i}`}
              className="border-t border-gray-100 dark:border-neutral-800"
            >
              <td className="py-1 pr-3 tabular-nums">{tx.tradeDate}</td>
              <td className="py-1 pr-3">{tx.action}</td>
              <td className="py-1 pr-3 font-mono text-xs">{symbolOf(tx)}</td>
              <td className="py-1 pr-3 text-right tabular-nums">{tx.quantity}</td>
              <td className="py-1 pr-3 text-right tabular-nums">{fmtMoney(tx.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
