import { Suspense } from "react";

import { RequesterDashboardHome } from "@/features/requester/components/requester-dashboard-home";
import { getRequesterDashboard } from "@/features/requester/queries";

export default function RequesterDashboardPage() {
  return (
    <Suspense
      fallback={
        <p className="text-sm text-muted-foreground">Loading dashboard...</p>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}

async function DashboardContent() {
  const dashboard = await getRequesterDashboard();

  return <RequesterDashboardHome dashboard={dashboard} />;
}
