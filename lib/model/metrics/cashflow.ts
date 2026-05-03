import type { Action, Transaction } from "@/lib/csv/types";
import type { FlowPoint } from "@/lib/model/types";

export type FlowKind = "external" | "internal" | "unknown";

const EXTERNAL: ReadonlySet<Action> = new Set(["Journal", "WireSent"]);
const UNKNOWN: ReadonlySet<Action> = new Set(["Unknown"]);

export function classifyAction(action: Action): FlowKind {
  if (EXTERNAL.has(action)) return "external";
  if (UNKNOWN.has(action)) return "unknown";
  return "internal";
}

export function externalFlowsBetween(
  transactions: Transaction[],
  fromDate: string,
  toDate: string,
): FlowPoint[] {
  return transactions
    .filter(
      (t) =>
        classifyAction(t.action) === "external" &&
        t.tradeDate >= fromDate &&
        t.tradeDate <= toDate,
    )
    .map((t) => ({ date: t.tradeDate, signedAmount: t.amount }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function unknownActionsBetween(
  transactions: Transaction[],
  fromDate: string,
  toDate: string,
): Transaction[] {
  return transactions.filter(
    (t) =>
      classifyAction(t.action) === "unknown" &&
      t.tradeDate >= fromDate &&
      t.tradeDate <= toDate,
  );
}
