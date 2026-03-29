import { Suspense } from "react";
import ApprovalsPageClient from "./ApprovalsPageClient";

export default function ApprovalsPage() {
  return (
    <Suspense>
      <ApprovalsPageClient />
    </Suspense>
  );
}
