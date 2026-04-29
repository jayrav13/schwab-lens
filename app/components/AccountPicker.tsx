"use client";

import { useRouter } from "next/navigation";
import type { Account } from "@/lib/db/repos/accounts";

type Props = { accounts: Account[]; currentUuid?: string };

export function AccountPicker({ accounts, currentUuid }: Props) {
  const router = useRouter();
  return (
    <select
      value={currentUuid ?? ""}
      onChange={(e) => {
        const uuid = e.target.value;
        if (uuid) router.push(`/accounts/${uuid}/options`);
        else router.push("/");
      }}
      className="text-sm bg-transparent border border-gray-300 dark:border-neutral-700 rounded px-2 py-1 text-gray-700 dark:text-gray-200"
    >
      <option value="">All accounts</option>
      {accounts.map((a) => (
        <option key={a.uuid} value={a.uuid}>
          {a.label}
        </option>
      ))}
    </select>
  );
}
