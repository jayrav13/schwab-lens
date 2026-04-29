import Link from "next/link";

export type AccountTabFlags = {
  showOptions: boolean;
  showTrades: boolean;
};

type Props = {
  uuid: string;
  flags: AccountTabFlags;
  active?: "overview" | "options" | "trades" | "transactions";
};

const ALL_TABS = [
  { key: "overview" as const, label: "Overview", path: "overview" },
  { key: "options" as const, label: "Options", path: "options" },
  { key: "trades" as const, label: "Trades", path: "trades" },
  { key: "transactions" as const, label: "Transactions", path: "transactions" },
];

export function AccountTabs({ uuid, flags, active }: Props) {
  const tabs = ALL_TABS.filter((t) => {
    if (t.key === "options") return flags.showOptions;
    if (t.key === "trades") return flags.showTrades;
    return true;
  });
  return (
    <nav className="border-b border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
      <div className="max-w-7xl mx-auto px-6 py-2 flex items-center gap-4">
        {tabs.map((t) => {
          const isActive = active === t.key;
          return (
            <Link
              key={t.key}
              href={`/accounts/${uuid}/${t.path}`}
              className={`text-sm ${
                isActive
                  ? "font-semibold text-gray-900 dark:text-gray-100"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
