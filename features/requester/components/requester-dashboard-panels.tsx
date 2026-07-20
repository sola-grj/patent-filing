import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UrgentBadge } from "@/features/requester/components/urgent-badge";
import { RequestSummaryBadges } from "@/features/requester/components/request-summary-badges";
import { formatDate } from "@/features/requester/format";
import type { getRequesterDashboard } from "@/features/requester/queries";
import { RequesterCreateRequestButton } from "./requester-create-request-button";

type DashboardData = Awaited<ReturnType<typeof getRequesterDashboard>>;
type DashboardRequest = DashboardData["recentRequests"][number];
type DashboardDraft = DashboardData["recentDrafts"][number];

export function RecentRequestsPanel({
  requests,
  dictionaries,
}: {
  requests: DashboardRequest[];
  dictionaries: NonNullable<DashboardData["dictionaries"]>;
}) {
  return (
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
          <Link href="/requester/requests">View all</Link>
        </Button>
      </CardHeader>
      <CardContent className="hide-scrollbar min-h-0 flex-1 overflow-y-auto px-6 py-2">
        {requests.length ? (
          <div className="divide-y">
            {requests.map((request) => {
              const requirement = Array.isArray(
                request.translation_requirements,
              )
                ? request.translation_requirements[0]
                : request.translation_requirements;
              const patent = Array.isArray(request.request_patents)
                ? request.request_patents[0]
                : request.request_patents;
              const channelLabel = requestsDictionaryLabel(
                request.channel_code,
                "channels",
                dictionaries,
              );
              return (
                <Link
                  key={request.id}
                  href={`/requester/requests/${request.id}`}
                  className="group grid items-center gap-4 py-4 text-sm md:grid-cols-[minmax(0,1fr)_minmax(22rem,auto)_auto]"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-base font-semibold text-foreground">
                        {patent?.patent_number || "Request"}
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
                    serviceOptions={dictionaries.serviceTypes}
                    status={request.requester_status}
                  />
                  <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
                </Link>
              );
            })}
          </div>
        ) : (
          <EmptyPanelCopy
            title="No active requests yet"
            description="Requests you submit will appear here with status, urgency, and latest update timestamps."
          />
        )}
      </CardContent>
    </Card>
  );
}

function requestsDictionaryLabel(
  value: string | null,
  key: "channels" | "serviceTypes",
  dictionaries: NonNullable<DashboardData["dictionaries"]>,
) {
  if (!value) return "-";
  return (
    dictionaries[key].find((option) => option.value === value)?.label ?? value
  );
}

export function DraftsPanel({
  drafts,
  draftCount,
}: {
  drafts: DashboardDraft[];
  draftCount: number;
}) {
  return (
    <Card className="flex h-[27rem] min-h-[27rem] flex-col overflow-hidden rounded-[28px] border shadow-sm">
      <CardHeader className="flex shrink-0 flex-row items-start justify-between gap-4 space-y-0 border-b bg-slate-50/70 px-6 py-5">
        <div>
          <CardTitle className="text-xl">Drafts in Progress</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {draftCount} draft requests saved and ready to resume.
          </p>
        </div>
        <Button asChild variant="link" size="sm" className="px-0">
          <Link href="/requester/drafts">Open drafts</Link>
        </Button>
      </CardHeader>
      <CardContent className="hide-scrollbar min-h-0 flex-1 overflow-y-auto px-6 py-2">
        {drafts.length ? (
          <div className="divide-y">
            {drafts.map((draft) => (
              <Link
                key={draft.id}
                href={`/requester/drafts/${draft.id}`}
                className="flex items-center justify-between gap-4 py-4 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold text-foreground">
                    {draft.request_no}
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    {draft.title?.trim() || "Draft request"}
                    {" · "}
                    Resume from {draft.last_draft_step ?? "Source"}
                  </p>
                </div>
                <span className="shrink-0 text-muted-foreground">
                  {formatDate(draft.updated_at)}
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyPanelCopy
            title="No saved drafts"
            description="Draft requests will be listed here after you save work in progress from the request wizard."
          />
        )}
      </CardContent>
    </Card>
  );
}

export function DashboardEmptyState() {
  return (
    <Card className="flex min-h-[22rem] flex-col rounded-[28px] border shadow-sm">
      <CardContent className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 p-8 text-center">
        <div className="space-y-2">
          <p className="text-lg font-semibold">No requests yet</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Start your first Patentia request to track quotes, negotiations, and
            delivery in one operational workspace.
          </p>
        </div>
        <RequesterCreateRequestButton label="Start First Request" />
      </CardContent>
    </Card>
  );
}

function EmptyPanelCopy({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-[12rem] items-center justify-center rounded-2xl border border-dashed bg-background px-6 py-10 text-center">
      <div className="max-w-sm space-y-2">
        <p className="font-semibold text-foreground">{title}</p>
        <p className="text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
