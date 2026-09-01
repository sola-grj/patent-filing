import type { getRequesterDashboard } from "@/features/requester/queries";

import { HeroSection } from "./requester-dashboard-hero";

type DashboardData = Awaited<ReturnType<typeof getRequesterDashboard>>;

export function RequesterDashboardHome({
  dashboard,
}: {
  dashboard: DashboardData;
}) {
  const { organization } = dashboard;

  if (!organization) {
    return (
      <div className="mx-auto flex min-h-[calc(100vh-12rem)] max-w-3xl flex-col items-center justify-center gap-8 text-center">
        <div className="space-y-3">
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Requester Portal
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Waiting for organization assignment
          </h1>
          <p className="mx-auto max-w-xl text-sm text-muted-foreground">
            Pat is invitation only. Ask your customer administrator or ECI
            supplier administrator to invite this email address.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 items-center justify-center pb-[12vh]">
      <HeroSection
        email={dashboard.email}
        organizationName={organization.name}
        recentSearches={dashboard.recentSearches}
      />
    </div>
  );
}
