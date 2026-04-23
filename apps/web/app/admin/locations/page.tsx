import Link from "next/link";
import AdminLocationsClient from "./AdminLocationsClient";
import { WorkspaceHeader, WorkspacePage } from "../../components/WorkspaceLayout";

export default function AdminLocationsPage() {
  return (
    <WorkspacePage>
      <div className="space-y-8">
        <WorkspaceHeader
          eyebrow="Enterprise Settings"
          title="Locations"
          description="MVP0.3 - tenant location master data."
          action={
            <Link
              href="/"
              className="itam-secondary-action"
            >
              Back
            </Link>
          }
        />

        <AdminLocationsClient />
      </div>
    </WorkspacePage>
  );
}
