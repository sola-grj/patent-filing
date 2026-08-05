import { Suspense } from "react";

import { PmComingSoon } from "@/features/pm/components/pm-coming-soon";

export default function PmPatentSearchPage() {
  return (
    <Suspense
      fallback={<p className="text-sm text-muted-foreground">Loading patent search...</p>}
    >
      <PmComingSoon
        title="Patent Search"
        description="Search patent records and prepare new operational matters."
      />
    </Suspense>
  );
}
