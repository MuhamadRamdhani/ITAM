import { Suspense } from "react";
import SoftwareProductsClient from "./SoftwareProductsClient";

export default function SoftwareProductsPage() {
  return (
    <Suspense>
      <SoftwareProductsClient />
    </Suspense>
  );
}