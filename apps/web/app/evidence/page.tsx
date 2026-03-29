import { Suspense } from "react";
import EvidencePageClient from "./EvidencePageClient";

export default function EvidencePage() {
  return (
    <Suspense>
      <EvidencePageClient />
    </Suspense>
  );
}
