import path from "node:path";
import type { Brokerage } from "@/lib/brokerage/types";
import { schwab } from "@/lib/brokerage/schwab";

export const brokerages: Brokerage[] = [schwab];

export function findBrokerage(slug: string): Brokerage | null {
  return brokerages.find((b) => b.slug === slug) ?? null;
}

export function routeFile(
  filenameOrPath: string,
): { brokerage: Brokerage; kind: "transactions" | "positions" } | null {
  const base = path.basename(filenameOrPath);
  for (const b of brokerages) {
    if (b.filenamePatterns.transactions.some((re) => re.test(base))) {
      return { brokerage: b, kind: "transactions" };
    }
    if (b.filenamePatterns.positions.some((re) => re.test(base))) {
      return { brokerage: b, kind: "positions" };
    }
  }
  return null;
}
