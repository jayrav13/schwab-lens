import type { OpenOption } from "@/lib/model/types";

export type SnapshotShare = {
  ticker: string;
  quantity: number;
  price: number;
  marketValue: number;
  costBasis: number;
};

export type SnapshotOption = {
  underlying: string;
  expiry: string;
  strike: number;
  callPut: "C" | "P";
  quantity: number;
  price: number;
  marketValue: number;
  delta: number | null;
  theta: number | null;
  intrinsicValue: number | null;
};

export type PositionsSnapshot = {
  asOf: string;
  cash: number;
  totalValue: number;
  shares: SnapshotShare[];
  options: SnapshotOption[];
  sourceFile: string;
};

export type Seed = {
  asOf: string;
  cash: number;
  initialShares: Array<{ ticker: string; shares: number; costBasis: number }>;
  initialOptions: OpenOption[];
};
