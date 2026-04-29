type Props = { dataDir: string };

export function OnboardingCard({ dataDir }: Props) {
  return (
    <div className="max-w-2xl mx-auto mt-16 rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6">
      <h2 className="text-xl font-semibold mb-2">Getting started</h2>
      <p className="text-gray-700 dark:text-gray-200 mb-4">
        No accounts have been ingested yet. Drop your Schwab CSV exports under{" "}
        <code className="bg-gray-100 dark:bg-neutral-800 px-1 rounded">{dataDir}</code>:
      </p>
      <ul className="list-disc pl-5 text-sm text-gray-700 dark:text-gray-200 mb-4 space-y-1">
        <li>
          Transactions: <code>{dataDir}/transactions/</code>
        </li>
        <li>
          Positions: <code>{dataDir}/positions/</code>
        </li>
      </ul>
      <p className="text-gray-700 dark:text-gray-200 mb-4">
        Then run{" "}
        <code className="bg-gray-100 dark:bg-neutral-800 px-1 rounded">npm run ingest</code>{" "}
        (or use the{" "}
        <code className="bg-gray-100 dark:bg-neutral-800 px-1 rounded">/ingest</code>{" "}
        Claude Code skill).
      </p>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        The data directory is gitignored — raw exports never reach the repo.
      </p>
    </div>
  );
}
