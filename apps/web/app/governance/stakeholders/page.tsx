import { Suspense } from "react";
import StakeholdersRegisterPageClient from "./StakeholdersRegisterPageClient";

export default function GovernanceStakeholdersPage() {
  return (
    <Suspense>
      <StakeholdersRegisterPageClient />
    </Suspense>
  );
}
