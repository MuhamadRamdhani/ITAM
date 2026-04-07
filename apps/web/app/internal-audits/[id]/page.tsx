import InternalAuditDetailClient from './InternalAuditDetailClient';

export default async function InternalAuditDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <InternalAuditDetailClient auditId={id} />;
}