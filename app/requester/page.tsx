import { Suspense } from "react";

import { RequesterDashboardHome } from "@/features/requester/components/requester-dashboard-home";
import { getRequesterDashboard } from "@/features/requester/queries";

export default function RequesterDashboardPage() {
  return (
    <div className="min-h-0 flex-1 overflow-hidden">
      <Suspense
        fallback={
          <p className="text-sm text-muted-foreground">Loading dashboard...</p>
        }
      >
        <DashboardContent />
      </Suspense>
    </div>
  );
}

async function DashboardContent() {
  const dashboard = await getRequesterDashboard();

  return <RequesterDashboardHome dashboard={dashboard} />;
}
