import ManagementReviewDetailClient from './ManagementReviewDetailClient';

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function ManagementReviewDetailPage({ params }: PageProps) {
  const { id } = await params;
  return <ManagementReviewDetailClient reviewId={Number(id)} />;
}