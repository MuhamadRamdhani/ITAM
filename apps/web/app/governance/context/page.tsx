import { Suspense } from "react";
import ContextRegisterPageClient from "./ContextRegisterPageClient";

export default function GovernanceContextPage() {
  return (
    <Suspense>
      <ContextRegisterPageClient />
    </Suspense>
  );
}
