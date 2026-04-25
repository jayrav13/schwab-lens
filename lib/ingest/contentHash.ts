import { createHash } from "node:crypto";
import type {
  CanonicalTransaction,
  CanonicalPositionSnapshot,
} from "@/lib/brokerage/types";

function replacer(_key: string, val: unknown): unknown {
  if (val !== null && typeof val === "object" && !Array.isArray(val)) {
    const obj = val as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(obj).sort()) sorted[k] = obj[k];
    return sorted;
  }
  return val;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, replacer);
}

function sha256Hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

export function hashTransaction(
  brokerageSlug: string,
  externalId: string,
  tx: CanonicalTransaction,
): string {
  return sha256Hex(canonicalJson({
    kind: "transaction",
    brokerage: brokerageSlug,
    account: externalId,
    tradeDate: tx.tradeDate,
    actionRaw: tx.actionRaw,
    symbol: tx.symbol,
    description: tx.description,
    quantity: tx.quantity,
    price: tx.price,
    fees: tx.fees,
    amount: tx.amount,
    raw: tx.raw,
  }));
}

export function hashSnapshot(
  brokerageSlug: string,
  externalId: string,
  snap: CanonicalPositionSnapshot,
): string {
  return sha256Hex(canonicalJson({
    kind: "snapshot",
    brokerage: brokerageSlug,
    account: externalId,
    asOf: snap.asOf,
    symbol: snap.symbol,
    quantity: snap.quantity,
    price: snap.price,
    marketValue: snap.marketValue,
    costBasis: snap.costBasis,
    assetType: snap.assetType,
    description: snap.description,
    raw: snap.raw,
  }));
}
