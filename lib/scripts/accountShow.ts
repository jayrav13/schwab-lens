import type { Db } from "@/lib/db/connect";
import { getAccountByExternal } from "@/lib/db/repos/accounts";

const FIELDS: Array<[label: string, key: keyof FieldsView]> = [
  ["brokerage_slug:      ", "brokerageSlug"],
  ["external_id:         ", "externalId"],
  ["label:               ", "label"],
  ["seed_date:           ", "seedDate"],
  ["seed_value:          ", "seedValue"],
  ["benchmark:           ", "benchmark"],
  ["expected_real_return:", "expectedRealReturn"],
  ["target_value:        ", "targetValue"],
  ["account_group:       ", "accountGroup"],
  ["first_seen_at:       ", "firstSeenAt"],
  ["last_seen_at:        ", "lastSeenAt"],
];

type FieldsView = {
  brokerageSlug: string;
  externalId: string;
  label: string;
  seedDate: string | null;
  seedValue: number | null;
  benchmark: string | null;
  expectedRealReturn: number | null;
  targetValue: number | null;
  accountGroup: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
};

function fmtVal(v: unknown): string {
  if (v === null || v === undefined) return "(unset)";
  return String(v);
}

export function formatAccountShow(db: Db, account: string): string {
  const m = account.match(/^([a-z]+):([A-Za-z0-9]+)$/);
  if (!m) {
    throw new Error(
      `account-show: --account must be '<brokerage>:<external_id>' format, got: ${account}`,
    );
  }
  const [, brokerageSlug, externalId] = m;
  const row = getAccountByExternal(db, brokerageSlug, externalId);
  if (!row) {
    throw new Error(`account-show: No account ${account}`);
  }
  const view: FieldsView = {
    brokerageSlug: row.brokerageSlug,
    externalId: row.externalId,
    label: row.label,
    seedDate: row.seedDate,
    seedValue: row.seedValue,
    benchmark: row.benchmark,
    expectedRealReturn: row.expectedRealReturn,
    targetValue: row.targetValue,
    accountGroup: row.accountGroup,
    firstSeenAt: row.firstSeenAt,
    lastSeenAt: row.lastSeenAt,
  };
  const lines: string[] = [];
  for (const [label, key] of FIELDS) {
    lines.push(`${label}  ${fmtVal(view[key])}`);
  }
  return lines.join("\n");
}
