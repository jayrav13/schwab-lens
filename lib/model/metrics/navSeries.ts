import type { PositionSnapshotRow } from "@/lib/db/repos/positionSnapshots";
import type { NavPoint } from "@/lib/model/types";

export function navSeriesFromSnapshots(
  rows: PositionSnapshotRow[],
): NavPoint[] {
  // Last-write-wins by id for (date, symbol). Then sum market_value per date.
  const latestBySymbol = new Map<string, PositionSnapshotRow>();
  for (const r of rows) {
    const key = `${r.as_of}|${r.symbol}`;
    const prior = latestBySymbol.get(key);
    if (!prior || r.id > prior.id) {
      latestBySymbol.set(key, r);
    }
  }

  const totalsByDate = new Map<string, number>();
  for (const r of latestBySymbol.values()) {
    const mv = r.market_value ?? 0;
    totalsByDate.set(r.as_of, (totalsByDate.get(r.as_of) ?? 0) + mv);
  }

  return Array.from(totalsByDate.entries())
    .map(([date, nav]) => ({ date, nav }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
