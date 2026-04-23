import { Suspense } from "react";
import SoftwareProductsClient from "./SoftwareProductsClient";
import { WorkspacePage } from "../components/WorkspaceLayout";

export default function SoftwareProductsPage() {
  return (
    <WorkspacePage>
      <div className="w-full">
        <Suspense>
          <SoftwareProductsClient />
        </Suspense>
      </div>
    </WorkspacePage>
  );
}
