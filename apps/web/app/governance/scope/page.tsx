import { Suspense } from "react";
import ScopeVersionsPageClient from "./ScopeVersionsPageClient";

export default function GovernanceScopePage() {
  return (
    <main className="itam-page-shell">
      <div className="itam-page-shell-inner">
        <Suspense>
          <ScopeVersionsPageClient />
        </Suspense>
      </div>
    </main>
  );
}
