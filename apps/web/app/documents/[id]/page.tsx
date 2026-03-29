import { notFound } from "next/navigation";
import DocumentDetailClient from "./DocumentDetailClient";

export default async function DocumentDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;

  if (!/^\d+$/.test(String(id ?? ""))) {
    notFound();
  }

  return <DocumentDetailClient documentId={Number(id)} />;
}