import { loadHomeView } from "@/lib/server/home";
import { OnboardingCard } from "@/app/components/OnboardingCard";
import { TotalNavStrip } from "@/app/components/TotalNavStrip";
import { AccountCard } from "@/app/components/AccountCard";
import type { PeriodKey } from "@/lib/server/period";

export const dynamic = "force-dynamic";

const VALID: ReadonlySet<PeriodKey> = new Set(["1M", "3M", "YTD", "1Y", "All"]);

// `/` defaults to 1M per spec, distinct from the shared YTD default.
function homePeriodKey(input: string | undefined): PeriodKey {
  if (input && (VALID as Set<string>).has(input)) return input as PeriodKey;
  return "1M";
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { period: periodParam } = await searchParams;
  const period = homePeriodKey(periodParam);

  const view = await loadHomeView({ period });

  if (view.accounts.length === 0) {
    return (
      <main className="min-h-screen p-6 max-w-7xl mx-auto">
        <OnboardingCard dataDir="data/" />
      </main>
    );
  }

  return (
    <main className="min-h-screen p-6 max-w-7xl mx-auto">
      <TotalNavStrip view={view} />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {view.accounts.map((summary) => (
          <AccountCard key={summary.account.uuid} summary={summary} />
        ))}
      </div>
      <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-6 text-right">
        Last refresh {new Date(view.loadedAt).toLocaleTimeString()}
      </div>
    </main>
  );
}
