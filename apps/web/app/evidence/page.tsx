import { Suspense } from "react";
import EvidencePageClient from "./EvidencePageClient";
import { WorkspacePage } from "../components/WorkspaceLayout";

export default function EvidencePage() {
  return (
    <WorkspacePage>
      <Suspense>
        <EvidencePageClient />
      </Suspense>
    </WorkspacePage>
  );
}
