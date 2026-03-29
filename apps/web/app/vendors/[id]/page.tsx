import VendorDetailClient from "./VendorDetailClient";

export default async function VendorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <VendorDetailClient vendorId={id} />
      </div>
    </main>
  );
}