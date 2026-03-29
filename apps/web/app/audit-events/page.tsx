import { Suspense } from "react";
import AuditEventsPageClient from "./AuditEventsPageClient";

export default function AuditEventsPage() {
  return (
    <Suspense>
      <AuditEventsPageClient />
    </Suspense>
  );
}
