import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { parseSchwabCsv } from "@/lib/csv/parse";
import { buildPortfolio } from "@/lib/model/portfolio";
import { readConfigFile } from "@/lib/config";
import type { PortfolioState } from "@/lib/model/types";

export type DashboardData =
  | { kind: "ready"; state: PortfolioState; sourceFile: string; loadedAt: string }
  | { kind: "no-csv"; dataDir: string }
  | { kind: "no-config"; dataDir: string }
  | { kind: "parse-error"; message: string };

export function loadDashboard(): DashboardData {
  const dataDir = path.join(process.cwd(), "data");
  const config = readConfigFile(dataDir);
  if (!config) return { kind: "no-config", dataDir };

  let files: string[];
  try {
    files = readdirSync(dataDir)
      .filter((f) => f.toLowerCase().endsWith(".csv"))
      .map((f) => path.join(dataDir, f));
  } catch {
    return { kind: "no-csv", dataDir };
  }
  if (files.length === 0) return { kind: "no-csv", dataDir };

  const newest = files
    .map((f) => ({ f, mtime: statSync(f).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)[0].f;

  try {
    const csv = readFileSync(newest, "utf8");
    const txs = parseSchwabCsv(csv);
    const state = buildPortfolio(txs, config);
    return {
      kind: "ready",
      state,
      sourceFile: path.basename(newest),
      loadedAt: new Date().toISOString(),
    };
  } catch (err) {
    return {
      kind: "parse-error",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
