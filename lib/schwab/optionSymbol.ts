import type { OptionLeg } from "@/lib/csv/types";

const PATTERN =
  /^([A-Z][A-Z0-9.]*)\s+(\d{2})\/(\d{2})\/(\d{4})\s+([0-9]+(?:\.[0-9]+)?)\s+([CP])$/;

export function parseOptionSymbol(symbol: string | null): OptionLeg | null {
  if (!symbol) return null;
  const match = symbol.trim().match(PATTERN);
  if (!match) return null;
  const [, ticker, mm, dd, yyyy, strike, cp] = match;
  return {
    ticker,
    expiry: `${yyyy}-${mm}-${dd}`,
    strike: Number(strike),
    type: cp === "C" ? "Call" : "Put",
  };
}
