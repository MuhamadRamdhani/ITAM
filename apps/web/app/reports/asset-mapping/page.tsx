import { Suspense } from "react";
import AssetMappingReportClient from "./AssetMappingReportClient";

export default function AssetMappingPage() {
  return (
    <Suspense>
      <AssetMappingReportClient />
    </Suspense>
  );
}