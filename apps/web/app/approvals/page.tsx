import { Suspense } from "react";
import Link from "next/link";
import ApprovalsPageClient from "./ApprovalsPageClient";
import { WorkspaceHeader, WorkspacePage } from "../components/WorkspaceLayout";

export default function ApprovalsPage() {
  return (
    <WorkspacePage>
      <div className="space-y-8">
        <WorkspaceHeader
          eyebrow="Operational Workspace"
          title="Approvals"
          description="Queue approval (MVP1.3)."
          action={
            <Link
              href="/"
              className="itam-secondary-action"
            >
              Back
            </Link>
          }
        />

        <Suspense>
          <ApprovalsPageClient />
        </Suspense>
      </div>
    </WorkspacePage>
  );
}
