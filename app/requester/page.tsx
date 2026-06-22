import Link from "next/link";
import { Suspense } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
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
  const visibleDrafts = recentDrafts.slice(0, 3);

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
    <div className="space-y-8">
      <section className="border-b pb-6">
        <h1 className="text-3xl font-semibold tracking-tight">
          {organization.name}&apos;s Workspace
        </h1>
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
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Recent Requests</CardTitle>
          <Button asChild variant="link" size="sm" className="px-0">
            <Link href="/requester/requests">More</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {recentRequests.length ? (
            <div className="divide-y">
              {recentRequests.map((request) => (
                <Link
                  key={request.id}
                  href={`/requester/requests/${request.id}`}
                  className="flex items-center justify-between py-3 text-sm"
                >
                  <span>
                    <span className="block font-semibold text-foreground">
                      {request.title ?? "Untitled request"}
                    </span>
                    <span className="block text-xs font-normal text-muted-foreground">
                      {request.request_no}
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    <RequesterStatusBadge status={request.requester_status} />
                    <span className="text-muted-foreground">
                      {formatDate(request.updated_at)}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No requests yet.</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
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
        <CardContent>
          {draftCount ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {draftCount} draft requests saved.
              </p>
              <div className="divide-y">
                {visibleDrafts.map((draft) => (
                  <Link
                    key={draft.id}
                    href={`/requester/drafts/${draft.id}`}
                    className="flex items-center justify-between py-3 text-sm"
                  >
                    <span>
                      {draft.title ?? "Untitled draft"}
                      <span className="block text-muted-foreground">
                        {draft.last_draft_step ?? "Basics"}
                      </span>
                    </span>
                    <span className="text-muted-foreground">
                      {formatDate(draft.updated_at)}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No drafts yet.</p>
          )}
        </CardContent>
      </Card>
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
