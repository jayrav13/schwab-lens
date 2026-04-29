import { redirect } from "next/navigation";

export default async function AccountIndexPage({
  params,
}: {
  params: Promise<{ uuid: string }>;
}) {
  const { uuid } = await params;
  redirect(`/accounts/${uuid}/overview`);
}
