import VendorsClient from "./VendorsClient";

export default function VendorsPage() {
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <VendorsClient />
      </div>
    </main>
  );
}