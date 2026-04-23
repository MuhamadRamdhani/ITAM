import Link from "next/link";
import AdminAssetTypesClient from "./AdminAssetTypesClient";
import { WorkspaceHeader, WorkspacePage } from "../../components/WorkspaceLayout";

export default function AdminAssetTypesPage() {
  return (
    <WorkspacePage>
      <div className="space-y-8">
        <WorkspaceHeader
          eyebrow="Enterprise Settings"
          title="Asset Types"
          description="MVP0.3 - editable asset type display labels."
          action={
            <Link
              href="/"
              className="itam-secondary-action"
            >
              Back
            </Link>
          }
        />

        <AdminAssetTypesClient />
      </div>
    </WorkspacePage>
  );
}
