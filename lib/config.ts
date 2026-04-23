import { readFileSync } from "node:fs";
import path from "node:path";
import type { Config } from "@/lib/model/types";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseConfig(json: string): Config {
  const parsed = JSON.parse(json) as Partial<Config> & {
    marketData?: { enabled?: unknown };
    benchmark?: unknown;
  };

  if (typeof parsed.seedDate !== "string") {
    throw new Error("config.seedDate must be a string in YYYY-MM-DD format");
  }
  if (!ISO_DATE.test(parsed.seedDate)) {
    throw new Error(
      `config.seedDate must be YYYY-MM-DD; got "${parsed.seedDate}"`,
    );
  }
  if (typeof parsed.seedValue !== "number" || !Number.isFinite(parsed.seedValue)) {
    throw new Error("config.seedValue must be a finite number");
  }

  const marketDataEnabled =
    parsed.marketData?.enabled === true ? true : false;

  let benchmark: string | null | undefined;
  if (parsed.benchmark === null) {
    benchmark = null;
  } else if (
    typeof parsed.benchmark === "string" &&
    parsed.benchmark.length > 0
  ) {
    benchmark = parsed.benchmark;
  } else {
    benchmark = undefined;
  }

  return {
    seedDate: parsed.seedDate,
    seedValue: parsed.seedValue,
    marketData: { enabled: marketDataEnabled },
    benchmark,
  };
}

export function readConfigFile(dataDir: string): Config | null {
  try {
    const json = readFileSync(path.join(dataDir, "config.json"), "utf8");
    return parseConfig(json);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}
