import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { parsePositionsCsv } from "@/lib/positions/parse";
import type { PositionsSnapshot } from "@/lib/positions/types";

const FILENAME_TIMESTAMP =
  /Demo-Positions-(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})(\d{2})\.csv$/i;

function filenameTimestampMinutes(filename: string): number | null {
  const m = filename.match(FILENAME_TIMESTAMP);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  return Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi)) / 60000;
}

function asOfMinutes(asOf: string): number {
  const [date, time] = asOf.split("T");
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  return Date.UTC(y, mo - 1, d, h, mi) / 60000;
}

export function loadPositionsFromDir(dir: string): PositionsSnapshot[] {
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir).filter((f) =>
    f.toLowerCase().endsWith(".csv"),
  );
  const snapshots: PositionsSnapshot[] = files.map((f) => {
    const text = readFileSync(path.join(dir, f), "utf8");
    const snap = parsePositionsCsv(text, f);

    const fileMin = filenameTimestampMinutes(f);
    if (fileMin !== null) {
      const headerMin = asOfMinutes(snap.asOf);
      if (Math.abs(fileMin - headerMin) > 1) {
        throw new Error(
          `loadPositionsFromDir: filename timestamp and header asOf disagree in ${f} (filename ~ ${fileMin}min, header ~ ${headerMin}min)`,
        );
      }
    }
    return snap;
  });

  snapshots.sort((a, b) => a.asOf.localeCompare(b.asOf));

  for (let i = 1; i < snapshots.length; i++) {
    if (snapshots[i].asOf === snapshots[i - 1].asOf) {
      throw new Error(
        `loadPositionsFromDir: duplicate asOf "${snapshots[i].asOf}" in files ${snapshots[i - 1].sourceFile} and ${snapshots[i].sourceFile}`,
      );
    }
  }
  return snapshots;
}

export function earliest(
  snapshots: PositionsSnapshot[],
): PositionsSnapshot | null {
  return snapshots.length > 0 ? snapshots[0] : null;
}

export function latest(
  snapshots: PositionsSnapshot[],
): PositionsSnapshot | null {
  return snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
}
