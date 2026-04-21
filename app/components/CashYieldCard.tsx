import type { PortfolioState } from "@/lib/model/types";
import { computeCashYield } from "@/lib/model/metrics/cash_yield";
import { formatCurrency } from "@/lib/util/money";

type Props = { state: PortfolioState };

export function CashYieldCard({ state }: Props) {
  const y = computeCashYield(state.transactions);

  const signed = (n: number) =>
    n > 0
      ? "text-emerald-700 dark:text-emerald-400"
      : n < 0
        ? "text-red-700 dark:text-red-400"
        : "text-gray-400 dark:text-gray-500";

  const prefix = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "");

  const row = (label: string, value: number, sub?: string) => (
    <div
      key={label}
      className="flex justify-between py-1.5 border-b border-gray-100 dark:border-neutral-800 last:border-0 text-[13px]"
    >
      <div>
        <strong>{label}</strong>
        {sub ? (
          <div className="text-[11px] text-gray-500 dark:text-gray-400">{sub}</div>
        ) : null}
      </div>
      <div className={`text-right font-semibold tabular-nums ${signed(value)}`}>
        {prefix(value)}
        {formatCurrency(Math.abs(value))}
      </div>
    </div>
  );

  return (
    <div className="rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4">
      <h3 className="text-sm font-bold uppercase tracking-wide text-gray-700 dark:text-gray-200 mb-0.5">
        Cash &amp; ancillary yield
      </h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
        Dividends, interest, fees, and net external journals.
      </p>
      {row("Dividends received", y.dividends)}
      {row("Bank interest", y.bankInterest)}
      {row("Credit interest", y.creditInterest)}
      {row("Service fees", y.fees)}
      {row("Misc cash entries", y.miscCashEntries, "waivers, rebates")}
      {row("Net journals", y.netJournals, "external flows — excluded from return %")}
      <div className="pt-2 mt-1 border-t border-gray-200 dark:border-neutral-800 flex justify-between text-[13px]">
        <strong>Total ancillary (excl. journals)</strong>
        <strong className={`tabular-nums ${signed(y.totalAncillary)}`}>
          {prefix(y.totalAncillary)}
          {formatCurrency(Math.abs(y.totalAncillary))}
        </strong>
      </div>
    </div>
  );
}
