import type { getRequesterDashboard } from "@/features/requester/queries";
import { WorkspaceSetupForm } from "./workspace-setup-form";
import { DashboardEmptyState, RecentRequestsPanel } from "./requester-dashboard-panels";
import { HeroSection, MetricCard } from "./requester-dashboard-hero";

type DashboardData = Awaited<ReturnType<typeof getRequesterDashboard>>;

export function RequesterDashboardHome({
  dashboard,
}: {
  dashboard: DashboardData;
}) {
  const { organization, stats, recentRequests, draftCount } =
    dashboard;

  if (!organization || !stats) {
    return (
      <div className="mx-auto flex min-h-[calc(100vh-12rem)] max-w-3xl flex-col items-center justify-center gap-8 text-center">
        <div className="space-y-3">
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Requester Portal
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Set up your Patentia workspace
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

  const activeRequestCount =
    stats.responding +
    stats.negotiating +
    stats.inProgress +
    stats.rejected +
    stats.completed;
  const showEmptyState = activeRequestCount === 0 && draftCount === 0;
  return (
    <div className="flex min-h-full flex-col gap-8 pb-2">
      <HeroSection organizationName={organization.name} />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          status="responding"
          value={stats.responding}
          href="/requester/requests?status=responding"
        />
        <MetricCard
          status="negotiation"
          value={stats.negotiating}
          href="/requester/requests?status=negotiation"
        />
        <MetricCard
          status="in_progress"
          value={stats.inProgress}
          href="/requester/requests?status=in_progress"
        />
        <MetricCard
          status="rejected"
          value={stats.rejected}
          href="/requester/requests?status=rejected"
        />
        <MetricCard
          status="completed"
          value={stats.completed}
          href="/requester/requests?status=completed"
        />
      </section>

      {showEmptyState ? (
        <DashboardEmptyState />
      ) : (
        <section className="grid min-h-[27rem] flex-1 grid-cols-1 items-stretch gap-6 pb-px">
          <RecentRequestsPanel
            requests={recentRequests}
            dictionaries={dashboard.dictionaries}
          />
        </section>
      )}
    </div>
  );
}
