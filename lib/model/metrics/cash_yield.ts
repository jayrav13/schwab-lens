import type { Transaction } from "@/lib/csv/types";

export type CashYield = {
  dividends: number;
  bankInterest: number;
  creditInterest: number;
  fees: number; // signed (negative)
  miscCashEntries: number;
  netJournals: number;
  totalAncillary: number; // dividends + interest + fees + misc (excludes journals)
};

export function computeCashYield(txs: Transaction[]): CashYield {
  let dividends = 0;
  let bankInterest = 0;
  let creditInterest = 0;
  let fees = 0;
  let miscCashEntries = 0;
  let netJournals = 0;

  for (const t of txs) {
    switch (t.action) {
      case "QualifiedDividend":
        dividends += t.amount;
        break;
      case "BankInterest":
        bankInterest += t.amount;
        break;
      case "CreditInterest":
        creditInterest += t.amount;
        break;
      case "ServiceFee":
        fees += t.amount;
        break;
      case "MiscCashEntry":
        miscCashEntries += t.amount;
        break;
      case "Journal":
      case "WireSent":
        netJournals += t.amount;
        break;
    }
  }

  return {
    dividends,
    bankInterest,
    creditInterest,
    fees,
    miscCashEntries,
    netJournals,
    totalAncillary: dividends + bankInterest + creditInterest + fees + miscCashEntries,
  };
}
