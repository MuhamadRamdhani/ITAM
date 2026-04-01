import KpiDetailClient from './KpiDetailClient';

type Props = {
  params: Promise<{
    id: string;
  }>;
};

export default async function KpiDetailPage({ params }: Props) {
  const { id } = await params;
  return <KpiDetailClient id={id} />;
}