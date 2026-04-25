export type ProjectionInput = {
  currentNav: number;
  targetValue: number;
  expectedRealReturn: number;
  asOfDate: string;
};

export type ProjectionResult =
  | { kind: "achieved"; targetValue: number; currentNav: number }
  | {
      kind: "computed";
      years: number;
      targetDate: string;
      currentNav: number;
      targetValue: number;
      rate: number;
    }
  | { kind: "unreachable"; reason: "non-positive-rate" | "non-positive-target" };

const DAYS_PER_YEAR = 365.25;

function addYearsToDate(asOfDate: string, years: number): string {
  const [y, m, d] = asOfDate.split("-").map(Number);
  const start = Date.UTC(y, m - 1, d);
  const ms = years * DAYS_PER_YEAR * 24 * 60 * 60 * 1000;
  const end = new Date(start + ms);
  // Round to nearest day by snapping to UTC midnight after rounding
  const dayMs = 24 * 60 * 60 * 1000;
  const rounded = new Date(Math.round(end.getTime() / dayMs) * dayMs);
  const yyyy = rounded.getUTCFullYear();
  const mm = String(rounded.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(rounded.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function computeProjection(input: ProjectionInput): ProjectionResult {
  const { currentNav, targetValue, expectedRealReturn, asOfDate } = input;

  if (targetValue <= 0 || currentNav <= 0) {
    return { kind: "unreachable", reason: "non-positive-target" };
  }
  if (currentNav >= targetValue) {
    return { kind: "achieved", currentNav, targetValue };
  }
  if (expectedRealReturn <= 0) {
    return { kind: "unreachable", reason: "non-positive-rate" };
  }

  const years = Math.log(targetValue / currentNav) / Math.log(1 + expectedRealReturn);
  const targetDate = addYearsToDate(asOfDate, years);

  return {
    kind: "computed",
    years,
    targetDate,
    currentNav,
    targetValue,
    rate: expectedRealReturn,
  };
}
