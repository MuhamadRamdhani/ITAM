import { Suspense } from "react";
import AssetCoverageReportClient from "./AssetCoverageReportClient";

export default function AssetCoveragePage() {
  return (
    <Suspense>
      <AssetCoverageReportClient />
    </Suspense>
  );
}