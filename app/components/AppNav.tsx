import Link from "next/link";
import type { Account } from "@/lib/db/repos/accounts";
import { AccountPicker } from "@/app/components/AccountPicker";

type Props = { accounts: Account[]; currentUuid?: string };

export function AppNav({ accounts, currentUuid }: Props) {
  return (
    <nav className="border-b border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
      <div className="max-w-7xl mx-auto px-6 py-3 flex items-center gap-6">
        <Link
          href="/"
          className="font-bold text-gray-900 dark:text-gray-100 hover:opacity-80"
        >
          Schwab Lens
        </Link>
        {accounts.length > 0 && (
          <AccountPicker accounts={accounts} currentUuid={currentUuid} />
        )}
      </div>
    </nav>
  );
}
