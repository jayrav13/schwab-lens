import Link from "next/link";
import type { Transaction } from "@/lib/csv/types";
import { formatCurrency } from "@/lib/util/money";

type Props = { transactions: Transaction[]; viewAllHref?: string };

const PREVIEW_COUNT = 10;

const ACTION_LABEL: Record<string, string> = {
  SellToOpen: "STO",
  BuyToClose: "BTC",
  Expired: "EXP",
  Assigned: "ASN",
  Buy: "BUY",
  Sell: "SELL",
  QualifiedDividend: "DIV",
  BankInterest: "INT",
  CreditInterest: "INT",
  Journal: "JRN",
  WireSent: "WIR",
  MiscCashEntry: "MSC",
  ServiceFee: "FEE",
  Unknown: "???",
};

const ACTION_STYLES: Record<string, string> = {
  SellToOpen: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  BuyToClose: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  Expired: "bg-gray-100 text-gray-700 dark:bg-neutral-800 dark:text-gray-200",
  Assigned: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  Buy: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  Sell: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200",
};

function describe(t: Transaction): string {
  if (t.option) {
    const e = `${t.option.expiry.slice(5, 7)}/${t.option.expiry.slice(8, 10)}`;
    return `${t.option.ticker} ${e} $${t.option.strike.toFixed(2)} ${t.option.type[0]} × ${t.quantity}`;
  }
  if (t.ticker) {
    return `${t.ticker} ${t.quantity ? `× ${t.quantity}` : ""}`;
  }
  return t.raw.Description ?? t.rawAction;
}

export function TransactionLogCard({ transactions, viewAllHref = "/transactions" }: Props) {
  const sorted = [...transactions].sort((a, b) =>
    a.tradeDate < b.tradeDate ? 1 : a.tradeDate > b.tradeDate ? -1 : 0,
  );
  const preview = sorted.slice(0, PREVIEW_COUNT);

  return (
    <div className="rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4">
      <div className="flex items-baseline justify-between mb-0.5">
        <h3 className="text-sm font-bold uppercase tracking-wide text-gray-700 dark:text-gray-200">
          Transaction log
        </h3>
        {sorted.length > 0 && (
          <Link
            href={viewAllHref}
            className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
          >
            View all {sorted.length} →
          </Link>
        )}
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
        Most recent {preview.length} of {sorted.length}.
      </p>

      <div>
        {preview.map((t, i) => (
          <div
            key={i}
            className="grid grid-cols-[72px_1fr_100px] gap-2 py-1.5 border-b border-gray-100 dark:border-neutral-800 last:border-0 text-xs"
          >
            <span className="text-gray-500 dark:text-gray-400 tabular-nums">
              {t.tradeDate.slice(5).replace("-", "/")}
            </span>
            <span>
              <span
                className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold mr-1 ${
                  ACTION_STYLES[t.action] ??
                  "bg-gray-100 text-gray-700 dark:bg-neutral-800 dark:text-gray-200"
                }`}
              >
                {ACTION_LABEL[t.action] ?? t.action}
              </span>
              {describe(t)}
            </span>
            <span
              className={`text-right tabular-nums font-semibold ${
                t.amount > 0
                  ? "text-emerald-700 dark:text-emerald-400"
                  : t.amount < 0
                    ? "text-red-700 dark:text-red-400"
                    : "text-gray-400 dark:text-gray-500"
              }`}
            >
              {t.amount === 0 ? "—" : formatCurrency(t.amount)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
