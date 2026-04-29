import { notFound } from "next/navigation";
import { getDb } from "@/lib/db/connection";
import { getAccountByUuid } from "@/lib/db/repos/accounts";

export default async function AccountLayout({
  params,
  children,
}: {
  params: Promise<{ uuid: string }>;
  children: React.ReactNode;
}) {
  const { uuid } = await params;
  const db = getDb();
  if (!getAccountByUuid(db, uuid)) notFound();
  return <>{children}</>;
}
