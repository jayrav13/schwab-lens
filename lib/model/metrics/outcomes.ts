import type { Transaction } from "@/lib/csv/types";

export type OutcomeCategory =
  | "Expired"
  | "ClosedProfit"
  | "ClosedLoss"
  | "Assigned";

export type OutcomeRow = {
  category: OutcomeCategory;
  contractCount: number;
  grossPremiumImpact: number; // signed: + for profit/kept, − for BTC losses, 0 for assigned
};

// Categorize each closed contract (contract-key) by its final disposition.
// Priority: any Assigned → Assigned; else any BTC → ClosedProfit/Loss by net cash flow on the key; else fully Expired.
export function computeOutcomes(txs: Transaction[]): OutcomeRow[] {
  type KeyState = {
    key: string;
    hadAssigned: boolean;
    hadBTC: boolean;
    hadExpired: boolean;
    openQty: number;
    stoAmount: number;
    btcAmount: number;
  };
  const state = new Map<string, KeyState>();
  for (const t of txs) {
    if (!t.option) continue;
    const k = `${t.option.ticker}|${t.option.expiry}|${t.option.strike}|${t.option.type}`;
    const s =
      state.get(k) ??
      {
        key: k,
        hadAssigned: false,
        hadBTC: false,
        hadExpired: false,
        openQty: 0,
        stoAmount: 0,
        btcAmount: 0,
      };
    if (t.action === "SellToOpen") {
      s.openQty += t.quantity;
      s.stoAmount += t.amount;
    } else if (t.action === "BuyToClose") {
      s.openQty -= t.quantity;
      s.btcAmount += t.amount; // negative
      s.hadBTC = true;
    } else if (t.action === "Expired") {
      s.openQty -= t.quantity;
      s.hadExpired = true;
    } else if (t.action === "Assigned") {
      s.openQty -= t.quantity;
      s.hadAssigned = true;
    }
    state.set(k, s);
  }

  const totals: Record<OutcomeCategory, OutcomeRow> = {
    Expired: { category: "Expired", contractCount: 0, grossPremiumImpact: 0 },
    ClosedProfit: { category: "ClosedProfit", contractCount: 0, grossPremiumImpact: 0 },
    ClosedLoss: { category: "ClosedLoss", contractCount: 0, grossPremiumImpact: 0 },
    Assigned: { category: "Assigned", contractCount: 0, grossPremiumImpact: 0 },
  };

  for (const s of state.values()) {
    if (s.openQty !== 0) continue; // still open, not counted
    const net = s.stoAmount + s.btcAmount; // btcAmount already negative
    if (s.hadAssigned) {
      totals.Assigned.contractCount += 1;
      totals.Assigned.grossPremiumImpact += s.stoAmount;
    } else if (s.hadBTC) {
      if (net >= 0) {
        totals.ClosedProfit.contractCount += 1;
        totals.ClosedProfit.grossPremiumImpact += net;
      } else {
        totals.ClosedLoss.contractCount += 1;
        totals.ClosedLoss.grossPremiumImpact += net;
      }
    } else if (s.hadExpired) {
      totals.Expired.contractCount += 1;
      totals.Expired.grossPremiumImpact += s.stoAmount;
    }
  }

  return [totals.Expired, totals.ClosedProfit, totals.ClosedLoss, totals.Assigned];
}
