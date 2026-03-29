import { Suspense } from "react";
import DocumentsPageClient from "./DocumentsPageClient";

export default function DocumentsPage() {
  return (
    <Suspense>
      <DocumentsPageClient />
    </Suspense>
  );
}
