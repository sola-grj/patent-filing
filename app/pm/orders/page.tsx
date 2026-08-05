import { Suspense } from "react";

import { PmComingSoon } from "@/features/pm/components/pm-coming-soon";

export default function PmOrdersPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading orders...</p>}>
      <PmComingSoon
        title="Orders"
        description="Manage confirmed orders and production handoffs."
      />
    </Suspense>
  );
}
