import ContractDetailClient from "./ContractDetailClient";

export default async function ContractDetailPage({
  params,
}: {
  params: Promise<{ id: string }> | { id: string };
}) {
  const resolvedParams = await Promise.resolve(params);
  return <ContractDetailClient contractId={resolvedParams.id} />;
}