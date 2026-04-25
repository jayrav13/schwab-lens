type Props = { dataDir: string; missing: "csv" | "config" };

export function OnboardingCard({ dataDir, missing }: Props) {
  return (
    <div className="max-w-2xl mx-auto mt-16 rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6">
      <h2 className="text-xl font-semibold mb-2">Getting started</h2>
      {missing === "csv" ? (
        <>
          <p className="text-gray-700 dark:text-gray-200 mb-4">
            No transactions or positions ingested yet. Run the ingest skill
            (or <code>npm run ingest</code>) after dropping brokerage CSV
            exports under{" "}
            <code className="bg-gray-100 dark:bg-neutral-800 px-1 rounded">
              {dataDir}/&lt;brokerage&gt;/&lt;account&gt;/
            </code>
            .
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Expected layout:{" "}
            <code>data/schwab/&lt;masked-id&gt;/transactions/*.csv</code> and{" "}
            <code>positions/*.csv</code>. The <code>data/</code> directory is
            gitignored — raw exports never reach the repo.
          </p>
        </>
      ) : (
        <>
          <p className="text-gray-700 dark:text-gray-200 mb-4">
            No primary account is configured. To get started:
          </p>
          <ol className="list-decimal list-inside ml-4 mt-2 space-y-1 text-gray-700 dark:text-gray-200">
            <li>
              Run <code>/ingest</code> to import your CSVs from{" "}
              <code>~/Downloads</code> into the DB.
            </li>
            <li>
              Run{" "}
              <code className="bg-gray-100 dark:bg-neutral-800 px-1 rounded">
                npm run account:configure -- --account=&lt;brokerage&gt;:&lt;id&gt;{" "}
                --primary --seed-date=YYYY-MM-DD --seed-value=&lt;amount&gt;
              </code>
            </li>
            <li>Reload this page.</li>
          </ol>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-3">
            Per-account seed and primary-account selection live in{" "}
            <code>data/portfolio.db</code> (gitignored).
          </p>
        </>
      )}
    </div>
  );
}
