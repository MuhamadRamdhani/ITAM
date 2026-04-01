import { Suspense } from "react";
import ContextRegisterPageClient from "./ContextRegisterPageClient";

export default function GovernanceContextPage() {
  return (
    <main className="itam-page-shell">
      <div className="itam-page-shell-inner">
        <Suspense>
          <ContextRegisterPageClient />
        </Suspense>
      </div>
    </main>
  );
}
