import Link from "next/link";
import AdminIdentitiesClient from "./AdminIdentitiesClient";
import { WorkspaceHeader, WorkspacePage } from "../../components/WorkspaceLayout";

export default function AdminIdentitiesPage() {
  return (
    <WorkspacePage>
      <div className="space-y-8">
        <WorkspaceHeader
          eyebrow="Enterprise Settings"
          title="Identities"
          description="MVP0.3 - tenant identity / custodian master data."
          action={
            <Link
              href="/"
              className="itam-secondary-action"
            >
              Back
            </Link>
          }
        />

        <AdminIdentitiesClient />
      </div>
    </WorkspacePage>
  );
}
