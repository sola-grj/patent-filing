import Link from "next/link";
import { Suspense } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { cn } from "@/lib/utils";
import { RequesterCreateRequestButton } from "@/features/requester/components/requester-create-request-button";
import { UrgentBadge } from "@/features/requester/components/urgent-badge";
import { WorkspaceSetupForm } from "@/features/requester/components/workspace-setup-form";
import { formatDate } from "@/features/requester/format";
import { getRequesterDashboard } from "@/features/requester/queries";
import {
  RequesterStatusBadge,
  type RequesterLifecycleStatus,
  getRequesterStatusMeta,
} from "@/features/requester/requester-status";

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
  const { organization, stats, recentRequests, recentDrafts, draftCount } =
    await getRequesterDashboard();
  const hasRecentRequests = recentRequests.length > 0;
  const hasDrafts = draftCount > 0;
  const showEmptyState = !hasRecentRequests && !hasDrafts;

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

  return (
    <div className="flex h-full min-h-0 flex-col gap-8 overflow-hidden">
      <section className="border-b pb-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              {organization.name}&apos;s Workspace
            </h1>
          </div>
          <div className="shrink-0">
            <RequesterCreateRequestButton />
          </div>
        </div>
      </section>
      <div className="grid gap-4 md:grid-cols-5">
        <Metric
          status="responding"
          value={stats.responding}
          href="/requester/requests?status=responding"
        />
        <Metric
          status="negotiation"
          value={stats.negotiating}
          href="/requester/requests?status=negotiation"
        />
        <Metric
          status="in_progress"
          value={stats.inProgress}
          href="/requester/requests?status=in_progress"
        />
        <Metric
          status="rejected"
          value={stats.rejected}
          href="/requester/requests?status=rejected"
        />
        <Metric
          status="completed"
          value={stats.completed}
          href="/requester/requests?status=completed"
        />
      </div>
      {showEmptyState ? (
        <DashboardEmptyState />
      ) : (
        <div className="min-h-0 flex-1 overflow-hidden pb-px">
          <div
            className={cn(
              "grid h-full min-h-0 gap-6",
              hasRecentRequests && hasDrafts
                ? "grid-cols-1 lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]"
                : "grid-cols-1",
            )}
          >
            {hasRecentRequests ? (
              <RecentRequestsPanel requests={recentRequests} />
            ) : null}
            {hasDrafts ? (
              <DraftsPanel drafts={recentDrafts} draftCount={draftCount} />
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({
  status,
  value,
  href,
}: {
  status: RequesterLifecycleStatus;
  value: number;
  href: string;
}) {
  const statusMeta = getRequesterStatusMeta(status);

  return (
    <Link href={href} className="block cursor-pointer">
      <Card className="transition-colors hover:bg-muted/40">
        <CardHeader className="pb-2">
          <CardTitle className="sr-only">{statusMeta.label}</CardTitle>
          <StatusPill
            icon={statusMeta.icon}
            label={statusMeta.label}
            size="compact"
            width="full"
            toneClassName={statusMeta.toneClassName}
          />
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold">{value}</p>
        </CardContent>
      </Card>
    </Link>
  );
}

type DashboardRequest = Awaited<
  ReturnType<typeof getRequesterDashboard>
>["recentRequests"][number];

type DashboardDraft = Awaited<
  ReturnType<typeof getRequesterDashboard>
>["recentDrafts"][number];

function RecentRequestsPanel({
  requests,
}: {
  requests: DashboardRequest[];
}) {
  return (
    <Card className="flex min-h-[24rem] flex-col overflow-hidden lg:h-full lg:min-h-0">
      <CardHeader className="flex shrink-0 flex-row items-center justify-between space-y-0">
        <CardTitle>Recent Requests</CardTitle>
        <Button asChild variant="link" size="sm" className="px-0">
          <Link href="/requester/requests">More</Link>
        </Button>
      </CardHeader>
      <CardContent className="hide-scrollbar min-h-0 flex-1 overflow-y-auto">
        <div className="divide-y">
          {requests.map((request) => {
            const requirement = Array.isArray(request.translation_requirements)
              ? request.translation_requirements[0]
              : request.translation_requirements;

            return (
              <Link
                key={request.id}
                href={`/requester/requests/${request.id}`}
                className="flex items-center justify-between gap-4 py-3 text-sm"
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="block truncate font-semibold text-foreground">
                      {request.title ?? "Untitled request"}
                    </span>
                    {requirement?.is_urgent ? (
                      <UrgentBadge className="shrink-0" />
                    ) : null}
                  </span>
                  <span className="block text-xs font-normal text-muted-foreground">
                    {request.request_no}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  <RequesterStatusBadge status={request.requester_status} />
                  <span className="text-muted-foreground">
                    {formatDate(request.updated_at)}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function DraftsPanel({
  drafts,
  draftCount,
}: {
  drafts: DashboardDraft[];
  draftCount: number;
}) {
  return (
    <Card className="flex min-h-[24rem] flex-col overflow-hidden lg:h-full lg:min-h-0">
      <CardHeader className="flex shrink-0 flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle>My drafts</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Continue editing saved request drafts.
          </p>
        </div>
        <Button asChild variant="link" size="sm" className="px-0">
          <Link href="/requester/drafts">Open drafts</Link>
        </Button>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="shrink-0 pb-3">
          <p className="text-sm text-muted-foreground">
            {draftCount} draft requests saved.
          </p>
        </div>
        <div className="hide-scrollbar min-h-0 flex-1 overflow-y-auto">
          <div className="divide-y">
            {drafts.map((draft) => (
              <Link
                key={draft.id}
                href={`/requester/drafts/${draft.id}`}
                className="flex items-center justify-between gap-4 py-3 text-sm"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-foreground">
                    {draft.title ?? "Untitled draft"}
                  </span>
                  <span className="block text-muted-foreground">
                    {draft.last_draft_step ?? "Basics"}
                  </span>
                </span>
                <span className="shrink-0 text-muted-foreground">
                  {formatDate(draft.updated_at)}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DashboardEmptyState() {
  return (
    <Card className="flex min-h-0 flex-1 flex-col">
      <CardContent className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 p-8 text-center">
        <div className="space-y-2">
          <p className="text-lg font-semibold">No requests or drafts yet</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Start your first Patentia request to track quotes, orders, and
            delivery in one workspace.
          </p>
        </div>
        <RequesterCreateRequestButton />
      </CardContent>
    </Card>
  );
}
