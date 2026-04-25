import type { Brokerage } from "@/lib/brokerage/types";
import { TRANSACTIONS_PATTERNS, POSITIONS_PATTERNS } from "@/lib/brokerage/schwab/filenames";
import { identifySchwab } from "@/lib/brokerage/schwab/identify";
import { parseSchwabTransactions } from "@/lib/brokerage/schwab/transactions";
import { parseSchwabPositions } from "@/lib/brokerage/schwab/positions";

export const schwab: Brokerage = {
  slug: "schwab",
  displayName: "Charles Schwab",
  filenamePatterns: {
    transactions: TRANSACTIONS_PATTERNS,
    positions: POSITIONS_PATTERNS,
  },
  identify: identifySchwab,
  parseTransactions: parseSchwabTransactions,
  parsePositions: parseSchwabPositions,
};
