import AssetTransferRequestsClient from "./AssetTransferRequestsClient";
import AssetTransfersAccessGuard from "../components/AssetTransfersAccessGuard";
import { WorkspacePage } from "../components/WorkspaceLayout";

export default function AssetTransferRequestsPage() {
  return (
    <WorkspacePage>
      <div className="w-full">
        <AssetTransfersAccessGuard redirectTo="/assets">
          <AssetTransferRequestsClient />
        </AssetTransfersAccessGuard>
      </div>
    </WorkspacePage>
  );
}
