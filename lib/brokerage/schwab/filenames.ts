import path from "node:path";

export const TRANSACTIONS_PATTERNS: RegExp[] = [
  /^.+_XXX\d{3}_Transactions_\d{8}-\d{6}\.csv$/,
];

export const POSITIONS_PATTERNS: RegExp[] = [
  /^.+-Positions-\d{4}-\d{2}-\d{2}-\d{6}\.csv$/,
];

export function classifyFilename(
  filenameOrPath: string,
): "transactions" | "positions" | null {
  const base = path.basename(filenameOrPath);
  if (TRANSACTIONS_PATTERNS.some((re) => re.test(base))) return "transactions";
  if (POSITIONS_PATTERNS.some((re) => re.test(base))) return "positions";
  return null;
}
