import { Suspense } from "react";
import DocumentsPageClient from "./DocumentsPageClient";
import { WorkspacePage } from "../components/WorkspaceLayout";

export default function DocumentsPage() {
  return (
    <WorkspacePage>
      <Suspense>
        <DocumentsPageClient />
      </Suspense>
    </WorkspacePage>
  );
}
