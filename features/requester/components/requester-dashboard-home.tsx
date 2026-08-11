import type { getRequesterDashboard } from "@/features/requester/queries";

import { DashboardFocusGrid } from "./requester-dashboard-focus";
import {
  LifecyclePanel,
  RecentRequestsPanel,
} from "./requester-dashboard-panels";
import { HeroSection } from "./requester-dashboard-hero";
import { WorkspaceSetupForm } from "./workspace-setup-form";

type DashboardData = Awaited<ReturnType<typeof getRequesterDashboard>>;

export function RequesterDashboardHome({
  dashboard,
}: {
  dashboard: DashboardData;
}) {
  const { organization, stats, recentRequests } = dashboard;

  if (!organization || !stats) {
    return (
      <div className="mx-auto flex min-h-[calc(100vh-12rem)] max-w-3xl flex-col items-center justify-center gap-8 text-center">
        <div className="space-y-3">
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Requester Portal
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Set up your Pat workspace
          </h1>
          <p className="mx-auto max-w-xl text-sm text-muted-foreground">
            Create your organization profile before starting patent translation
            requests.
          </p>
        </div>
        <WorkspaceSetupForm />
      </div>
    );
  }

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_minmax(0,1fr)] gap-4 overflow-hidden">
      <HeroSection
        email={dashboard.email}
        organizationName={organization.name}
      />

      <DashboardFocusGrid
        attentionItems={dashboard.attentionItems}
        deadlineItems={dashboard.deadlineItems}
      />

      <section className="grid min-h-0 grid-rows-2 gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(20rem,2fr)] xl:grid-rows-1">
        <RecentRequestsPanel
          requests={recentRequests}
          dictionaries={dashboard.dictionaries}
        />
        <LifecyclePanel stats={stats} />
      </section>
    </div>
  );
}
