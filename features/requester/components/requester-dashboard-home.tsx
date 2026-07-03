import { cn } from "@/lib/utils";
import type { getRequesterDashboard } from "@/features/requester/queries";
import { WorkspaceSetupForm } from "./workspace-setup-form";
import { DashboardEmptyState, DraftsPanel, RecentRequestsPanel } from "./requester-dashboard-panels";
import { HeroSection, MetricCard } from "./requester-dashboard-hero";

type DashboardData = Awaited<ReturnType<typeof getRequesterDashboard>>;

export function RequesterDashboardHome({
  dashboard,
}: {
  dashboard: DashboardData;
}) {
  const { organization, stats, recentRequests, recentDrafts, draftCount } =
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
  const showRightRail = draftCount > 0;

  return (
    <div className="flex min-h-[calc(100dvh-9rem)] flex-col gap-8">
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
        <section
          className={cn(
            "grid min-h-[27rem] flex-1 items-stretch gap-6 pb-px",
            showRightRail
              ? "grid-cols-1 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.8fr)]"
              : "grid-cols-1",
          )}
        >
          <RecentRequestsPanel requests={recentRequests} />
          {showRightRail ? (
            <div className="grid h-full min-h-[27rem] gap-6">
              <DraftsPanel drafts={recentDrafts} draftCount={draftCount} />
            </div>
          ) : null}
        </section>
      )}
    </div>
  );
}
