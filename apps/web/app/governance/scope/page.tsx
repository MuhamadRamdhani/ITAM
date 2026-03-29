import { Suspense } from "react";
import ScopeVersionsPageClient from "./ScopeVersionsPageClient";

export default function GovernanceScopePage() {
  return (
    <Suspense>
      <ScopeVersionsPageClient />
    </Suspense>
  );
}
