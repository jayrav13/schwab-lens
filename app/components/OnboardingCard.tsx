type Props = { dataDir: string; missing: "csv" | "config" };

export function OnboardingCard({ dataDir, missing }: Props) {
  return (
    <div className="max-w-2xl mx-auto mt-16 rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6">
      <h2 className="text-xl font-semibold mb-2">Getting started</h2>
      {missing === "csv" ? (
        <>
          <p className="text-gray-700 dark:text-gray-200 mb-4">
            Drop a Schwab transactions CSV into{" "}
            <code className="bg-gray-100 dark:bg-neutral-800 px-1 rounded">{dataDir}</code> and
            refresh this page. The newest file by modification time will be
            used.
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Expected filename pattern:{" "}
            <code>Demo_XXX*_Transactions_*.csv</code>. This directory is
            gitignored — raw exports never reach the repo.
          </p>
        </>
      ) : (
        <>
          <p className="text-gray-700 dark:text-gray-200 mb-4">
            No <code>config.json</code> found. Create{" "}
            <code className="bg-gray-100 dark:bg-neutral-800 px-1 rounded">
              {dataDir}/config.json
            </code>{" "}
            with:
          </p>
          <pre className="bg-gray-900 dark:bg-black text-gray-100 rounded p-3 text-sm overflow-x-auto">
{`{
  "seedDate": "2026-01-15",
  "seedValue": 12345
}`}
          </pre>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-3">
            Seed values are personal — the file is gitignored.
          </p>
        </>
      )}
    </div>
  );
}
