import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Suspense } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PmAccessDenied } from "@/features/pm/components/pm-access-denied";
import { PmHeader } from "@/features/pm/components/pm-header";
import { getPmDashboard } from "@/features/pm/queries";
import { MetricCard } from "@/features/requester/components/requester-dashboard-hero";
import { RequestSummaryBadges } from "@/features/requester/components/request-summary-badges";
import { UrgentBadge } from "@/features/requester/components/urgent-badge";
import { formatDate } from "@/features/requester/format";

export default function PmDashboardPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading PM workspace...</p>}>
      <PmDashboardContent />
    </Suspense>
  );
}

async function PmDashboardContent() {
  const dashboard = await getPmDashboard();

  if (dashboard.denied) {
    return <PmAccessDenied />;
  }

  return (
    <div className="hide-scrollbar min-h-0 flex-1 space-y-8 overflow-y-auto pb-2">
      <PmHeader
        title="Operations workspace"
        description="Manage patent translation requests from quote preparation through production start."
        action={
          <Button asChild>
            <Link href="/pm/requests">Open request queue</Link>
          </Button>
        }
      />
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {dashboard.buckets.map((bucket) => (
          <MetricCard
            key={bucket.status}
            status={bucket.status}
            value={bucket.count}
            href={`/pm/requests?status=${bucket.status}`}
          />
        ))}
      </section>
      <Card className="flex h-[27rem] min-h-[27rem] flex-col overflow-hidden rounded-[28px] border shadow-sm">
        <CardHeader className="flex shrink-0 flex-row items-start justify-between gap-4 space-y-0 border-b bg-slate-50/70 px-6 py-5">
          <div>
            <CardTitle className="text-xl">Recent Requests</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Recent requests that may need follow-up, feedback, or delivery
              review.
            </p>
          </div>
          <Button asChild variant="link" size="sm" className="px-0">
            <Link href="/pm/requests">View all</Link>
          </Button>
        </CardHeader>
        <CardContent className="hide-scrollbar min-h-0 flex-1 overflow-y-auto px-6 py-2">
          {dashboard.recentRequests.length ? (
            <div className="divide-y">
              {dashboard.recentRequests.map((request) => {
                const requirement = Array.isArray(request.translation_requirements)
                  ? request.translation_requirements[0]
                  : request.translation_requirements;
                const patent = Array.isArray(request.request_patents)
                  ? request.request_patents[0]
                  : request.request_patents;
                const channelLabel = dictionaryLabel(
                  dashboard.dictionaries.channels,
                  request.channel_code,
                );
                return (
                  <Link
                    key={request.id}
                    href={`/pm/requests/${request.id}`}
                    className="group grid items-center gap-4 py-4 text-sm md:grid-cols-[minmax(0,1fr)_minmax(22rem,auto)_auto]"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-base font-semibold text-foreground">
                          {patent?.patent_number || request.title?.trim() || "Request"}
                        </span>
                        {requirement?.is_urgent ? <UrgentBadge /> : null}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
                        <span>{request.request_no}</span>
                        <span className="h-1 w-1 rounded-full bg-slate-300" />
                        <span>Updated {formatDate(request.updated_at)}</span>
                      </div>
                    </div>
                    <RequestSummaryBadges
                      channelCode={request.channel_code}
                      channelLabel={channelLabel}
                      serviceTypes={requirement?.service_types ?? []}
                      serviceOptions={dashboard.dictionaries.serviceTypes}
                      status={request.pm_status}
                    />
                    <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="flex min-h-[12rem] items-center justify-center rounded-2xl border border-dashed bg-background px-6 py-10 text-center">
              <div className="max-w-sm space-y-2">
                <p className="font-semibold text-foreground">No active requests yet</p>
                <p className="text-sm leading-6 text-muted-foreground">
                  Requests ready for PM follow-up will appear here.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function dictionaryLabel(
  options: Array<{ value: string; label: string }>,
  value?: string | null,
) {
  if (!value) return "-";
  return options.find((option) => option.value === value)?.label ?? value;
}
