import Link from "next/link";
import { Suspense } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge, formatDate } from "@/features/requester/format";
import { WorkspaceSetupForm } from "@/features/requester/components/workspace-setup-form";
import { getRequesterDashboard } from "@/features/requester/queries";

export default function RequesterDashboardPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading dashboard...</p>}>
      <DashboardContent />
    </Suspense>
  );
}

async function DashboardContent() {
  const { organization, stats, recentRequests } = await getRequesterDashboard();

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
            Create your organization profile before starting patent translation requests.
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
        <Metric title="Responding" value={stats.responding} />
        <Metric title="Negotiating" value={stats.negotiating} />
        <Metric title="In progress" value={stats.inProgress} />
        <Metric title="Rejected" value={stats.rejected} />
        <Metric title="Completed" value={stats.completed} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Recent Requests</CardTitle>
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
                  <span>{request.request_no} · {request.title ?? "Untitled request"}</span>
                  <span className="flex items-center gap-3">
                    <StatusBadge status={request.requester_status} />
                    <span className="text-muted-foreground">{formatDate(request.updated_at)}</span>
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No requests yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ title, value }: { title: string; value: number }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
      <CardContent><p className="text-2xl font-semibold">{value}</p></CardContent>
    </Card>
  );
}
