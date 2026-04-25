import type { Db } from "@/lib/db/connect";
import {
  getAccountByExternal,
  updateAccountSeed,
  updateAccountLabel,
  updateAccountBenchmark,
} from "@/lib/db/repos/accounts";
import { setSetting, setBoolSetting } from "@/lib/db/repos/settings";

export type ConfigureInput = {
  account: string;
  seedDate?: string;
  seedValue?: number;
  label?: string;
  benchmark?: string;
  primary?: boolean;
  marketDataEnabled?: boolean;
};

export function configureAccount(db: Db, input: ConfigureInput): void {
  const m = input.account.match(/^([a-z]+):([A-Za-z0-9]+)$/);
  if (!m) {
    throw new Error(
      `configureAccount: --account must be '<brokerage>:<external_id>', got: ${input.account}`,
    );
  }
  const [, brokerageSlug, externalId] = m;

  const account = getAccountByExternal(db, brokerageSlug, externalId);
  if (!account) {
    throw new Error(
      `configureAccount: No account ${input.account} — has it been ingested?`,
    );
  }

  if (input.label !== undefined) updateAccountLabel(db, account.id, input.label);
  if (input.benchmark !== undefined) updateAccountBenchmark(db, account.id, input.benchmark);
  if (input.seedDate !== undefined || input.seedValue !== undefined) {
    const seedDate = input.seedDate ?? account.seedDate;
    const seedValue = input.seedValue ?? account.seedValue;
    updateAccountSeed(db, account.id, seedDate, seedValue);
  }
  if (input.primary === true) {
    setSetting(db, "dashboard.primary_account", input.account);
  }
  if (input.marketDataEnabled !== undefined) {
    setBoolSetting(db, "market_data.enabled", input.marketDataEnabled);
  }
}
