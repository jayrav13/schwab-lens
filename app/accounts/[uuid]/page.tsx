import { permanentRedirect } from "next/navigation";

export default async function AccountIndexPage({
  params,
}: {
  params: Promise<{ uuid: string }>;
}) {
  const { uuid } = await params;
  permanentRedirect(`/accounts/${uuid}/overview`);
}
