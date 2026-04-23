import { Suspense } from "react";
import Link from "next/link";
import ScopeVersionsPageClient from "./ScopeVersionsPageClient";
import { WorkspaceHeader, WorkspacePage } from "../../components/WorkspaceLayout";

export default function GovernanceScopePage() {
  return (
    <WorkspacePage>
      <div className="space-y-8">
        <WorkspaceHeader
          eyebrow="Governance Scope"
          title="Governance Scope"
          description="MVP1.6 - scope versions with submit / approve / activate workflow."
          action={
            <Link href="/" className="itam-secondary-action">
              Back
            </Link>
          }
        />

        <Suspense>
          <ScopeVersionsPageClient />
        </Suspense>
      </div>
    </WorkspacePage>
  );
}
