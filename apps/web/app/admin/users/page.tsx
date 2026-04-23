import Link from "next/link";
import AdminUsersClient from "./AdminUsersClient";
import { WorkspaceHeader, WorkspacePage } from "../../components/WorkspaceLayout";

export default function AdminUsersPage() {
  return (
    <WorkspacePage>
      <div className="space-y-8">
        <WorkspaceHeader
          eyebrow="Enterprise Settings"
          title="Admin Users"
          description="MVP0.1 - tenant user management + role assignment."
          action={
            <Link
              href="/"
              className="itam-secondary-action"
            >
              Back
            </Link>
          }
        />

        <AdminUsersClient />
      </div>
    </WorkspacePage>
  );
}
