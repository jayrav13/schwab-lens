export type OptionSymbol = {
  underlying: string;
  expiry: string;
  strike: number;
  callPut: "C" | "P";
};

const OPTION_SYMBOL_RE =
  /^([A-Z.]+)\s+(\d{1,2})\/(\d{1,2})\/(\d{4})\s+([0-9]+(?:\.[0-9]+)?)\s+([PC])$/;

export function parseOptionSymbol(symbol: string): OptionSymbol | null {
  const m = symbol.match(OPTION_SYMBOL_RE);
  if (!m) return null;
  const [, underlying, mm, dd, yyyy, strike, pc] = m;
  return {
    underlying,
    expiry: `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`,
    strike: Number(strike),
    callPut: pc as "C" | "P",
  };
}
