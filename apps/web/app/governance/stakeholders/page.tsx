import { Suspense } from "react";
import StakeholdersRegisterPageClient from "./StakeholdersRegisterPageClient";

export default function GovernanceStakeholdersPage() {
  return (
    <main className="itam-page-shell">
      <div className="itam-page-shell-inner">
        <Suspense>
          <StakeholdersRegisterPageClient />
        </Suspense>
      </div>
    </main>
  );
}
