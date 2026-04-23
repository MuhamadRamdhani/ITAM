import Link from "next/link";
import AdminDepartmentsClient from "./AdminDepartmentsClient";
import { WorkspaceHeader, WorkspacePage } from "../../components/WorkspaceLayout";

export default function AdminDepartmentsPage() {
  return (
    <WorkspacePage>
      <div className="space-y-8">
        <WorkspaceHeader
          eyebrow="Enterprise Settings"
          title="Departments"
          description="MVP0.3 - tenant department master data."
          action={
            <Link
              href="/"
              className="itam-secondary-action"
            >
              Back
            </Link>
          }
        />

        <AdminDepartmentsClient />
      </div>
    </WorkspacePage>
  );
}
