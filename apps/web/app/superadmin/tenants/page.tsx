import Link from "next/link";
import SuperadminTenantsClient from "./SuperadminTenantsClient";
import { WorkspaceHeader, WorkspacePage } from "../../components/WorkspaceLayout";

export default function SuperadminTenantsPage() {
  return (
    <WorkspacePage>
      <div className="space-y-8">
        <WorkspaceHeader
          eyebrow="Platform Admin"
          title="Superadmin Tenants"
          description="MVP0.2 - platform tenant management."
          action={
            <Link
              href="/"
              className="itam-secondary-action"
            >
              Back
            </Link>
          }
        />

        <SuperadminTenantsClient />
      </div>
    </WorkspacePage>
  );
}
