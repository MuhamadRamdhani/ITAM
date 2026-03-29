import { Suspense } from "react";
import ContractsClient from "./ContractsClient";

export default function ContractsPage() {
  return (
    <Suspense>
      <ContractsClient />
    </Suspense>
  );
}