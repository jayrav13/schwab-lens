import path from "node:path";

export const TRANSACTIONS_PATTERN =
  /^.+_XXX\d{3}_Transactions_\d{8}-\d{6}\.csv$/;
export const POSITIONS_PATTERN =
  /^.+-Positions-\d{4}-\d{2}-\d{2}-\d{6}\.csv$/;

export type RouteKind = "transactions" | "positions";

export function routeFile(filepath: string): { kind: RouteKind } | null {
  const base = path.basename(filepath);
  if (TRANSACTIONS_PATTERN.test(base)) return { kind: "transactions" };
  if (POSITIONS_PATTERN.test(base)) return { kind: "positions" };
  return null;
}
