import CapaClient from "./CapaClient";
import { WorkspacePage } from "../components/WorkspaceLayout";

export default function CapaPage() {
  return (
    <WorkspacePage>
      <CapaClient />
    </WorkspacePage>
  );
}
