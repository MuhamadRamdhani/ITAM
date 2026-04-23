import { Suspense } from "react";
import ContractsClient from "./ContractsClient";
import { WorkspacePage } from "../components/WorkspaceLayout";

export default function ContractsPage() {
  return (
    <WorkspacePage>
        <Suspense>
          <ContractsClient />
        </Suspense>
    </WorkspacePage>
  );
}
