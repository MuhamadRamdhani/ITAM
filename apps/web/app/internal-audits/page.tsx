import InternalAuditsClient from "./InternalAuditsClient";
import { WorkspacePage } from "../components/WorkspaceLayout";

export default function InternalAuditsPage() {
  return (
    <WorkspacePage>
      <InternalAuditsClient />
    </WorkspacePage>
  );
}
