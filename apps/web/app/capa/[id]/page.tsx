import CapaDetailClient from './CapaDetailClient';

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function CapaDetailPage({ params }: PageProps) {
  const { id } = await params;
  return <CapaDetailClient capaId={Number(id)} />;
}
