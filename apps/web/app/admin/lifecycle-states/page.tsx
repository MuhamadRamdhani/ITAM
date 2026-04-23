import Link from "next/link";
import AdminLifecycleStatesClient from "./AdminLifecycleStatesClient";
import { WorkspaceHeader, WorkspacePage } from "../../components/WorkspaceLayout";

export default function AdminLifecycleStatesPage() {
  return (
    <WorkspacePage>
      <div className="space-y-8">
        <WorkspaceHeader
          eyebrow="Enterprise Settings"
          title="Lifecycle States"
          description="MVP0.3 - editable lifecycle state display labels."
          action={
            <Link
              href="/"
              className="itam-secondary-action"
            >
              Back
            </Link>
          }
        />

        <AdminLifecycleStatesClient />
      </div>
    </WorkspacePage>
  );
}
