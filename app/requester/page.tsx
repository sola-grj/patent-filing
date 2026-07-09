import { Suspense } from "react";

import { RequesterDashboardHome } from "@/features/requester/components/requester-dashboard-home";
import { getRequesterDashboard } from "@/features/requester/queries";

export default function RequesterDashboardPage() {
  return (
    <div className="relative left-1/2 right-1/2 min-h-0 w-screen flex-1 -translate-x-1/2 overflow-y-auto">
      <div className="mx-auto flex min-h-full w-full max-w-7xl flex-col px-6">
        <Suspense
          fallback={
            <p className="text-sm text-muted-foreground">Loading dashboard...</p>
          }
        >
          <DashboardContent />
        </Suspense>
      </div>
    </div>
  );
}

async function DashboardContent() {
  const dashboard = await getRequesterDashboard();

  return <RequesterDashboardHome dashboard={dashboard} />;
}
