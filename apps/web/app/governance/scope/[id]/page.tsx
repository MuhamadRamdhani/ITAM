import { notFound } from "next/navigation";
import ScopeVersionDetailClient from "./ScopeVersionDetailClient";

export default async function GovernanceScopeDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;

  if (!/^\d+$/.test(String(id ?? ""))) {
    notFound();
  }

  return <ScopeVersionDetailClient scopeVersionId={Number(id)} />;
}