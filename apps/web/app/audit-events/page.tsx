import { Suspense } from "react";
import AuditEventsPageClient from "./AuditEventsPageClient";

export default function AuditEventsPage() {
  return (
    <main className="itam-page-shell">
      <div className="itam-page-shell-inner">
        <Suspense>
          <AuditEventsPageClient />
        </Suspense>
      </div>
    </main>
  );
}
