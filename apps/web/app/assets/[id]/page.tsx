import { Suspense } from "react";
import AssetDetailClient from "./AssetDetailClient";

export default function AssetDetailPage() {
  return (
    <Suspense>
      <AssetDetailClient />
    </Suspense>
  );
}
