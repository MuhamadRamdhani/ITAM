import { Suspense } from "react";
import Link from "next/link";
import AssetsClient from "./AssetsClient";
import { WorkspaceHeader, WorkspacePage } from "../components/WorkspaceLayout";

export default function AssetsPage() {
  return (
    <WorkspacePage>
      <div className="space-y-8">
        <WorkspaceHeader
          eyebrow="Asset Registry"
          title="Assets"
          description="MVP1.0 - asset registry core."
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
          <AssetsClient />
        </Suspense>
      </div>
    </WorkspacePage>
  );
}
