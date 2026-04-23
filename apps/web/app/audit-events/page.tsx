import { Suspense } from "react";
import AuditEventsPageClient from "./AuditEventsPageClient";
import { WorkspacePage } from "../components/WorkspaceLayout";

export default function AuditEventsPage() {
  return (
    <WorkspacePage>
        <Suspense>
          <AuditEventsPageClient />
        </Suspense>
    </WorkspacePage>
  );
}
