import Link from "next/link";
import { CalendarDays, ChevronRight, FilePenLine } from "lucide-react";

import { Card } from "@/components/ui/card";
import { formatDate } from "@/features/requester/format";
import type { getRequesterDashboard } from "@/features/requester/queries";
import { RequestChannelBadge } from "@/features/requester/components/request-summary-badges";
import { resolveServiceTypeSelection } from "@/features/requester/request-paths";
import {
  getRequesterStatusMeta,
  RequesterStatusBadge,
  type RequesterLifecycleStatus,
} from "@/features/requester/requester-status";

type DashboardData = Awaited<ReturnType<typeof getRequesterDashboard>>;
type DashboardRequest = DashboardData["recentRequests"][number];
type DashboardDraft = DashboardData["recentDrafts"][number];
type DashboardStats = NonNullable<DashboardData["stats"]>;

export function RecentRequestsPanel({
  requests,
  dictionaries,
}: {
  requests: DashboardRequest[];
  dictionaries: NonNullable<DashboardData["dictionaries"]>;
}) {
  const visibleRequests = requests.slice(0, 3);

  return (
    <Card className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl shadow-sm">
      <div className="flex shrink-0 items-center justify-between border-b px-5 py-4">
        <h2 className="text-lg font-semibold">Recent Requests</h2>
        <Link
          href="/requester/requests"
          className="flex items-center gap-1 text-xs font-medium text-brand-soft-foreground"
        >
          View all requests
          <ChevronRight className="size-4" />
        </Link>
      </div>

      <div className="hidden shrink-0 grid-cols-[1.25fr_1fr_1fr_1fr_8rem] gap-4 border-b bg-muted/50 px-5 py-3 text-xs font-medium text-muted-foreground md:grid">
        <span>Matter</span>
        <span>Channel</span>
        <span>Service</span>
        <span>Updated</span>
        <span>Status</span>
      </div>

      {visibleRequests.length ? (
        <div className="hide-scrollbar flex min-h-0 flex-1 flex-col divide-y overflow-y-auto px-5">
          {visibleRequests.map((request) => (
            <RecentRequestRow
              key={request.id}
              request={request}
              serviceOptions={dictionaries.serviceTypes}
              fillAvailableHeight={visibleRequests.length > 1}
            />
          ))}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-6 text-center">
          <div>
            <p className="font-medium">No active requests yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Submitted requests will appear here.
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}

function RecentRequestRow({
  request,
  serviceOptions,
  fillAvailableHeight,
}: {
  request: DashboardRequest;
  serviceOptions: Array<{ value: string; label: string }>;
  fillAvailableHeight: boolean;
}) {
  const requirement = Array.isArray(request.translation_requirements)
    ? request.translation_requirements[0]
    : request.translation_requirements;
  const patent = Array.isArray(request.request_patents)
    ? request.request_patents[0]
    : request.request_patents;
  const serviceTypes = requirement?.service_types ?? [];
  const service = resolveServiceTypeSelection(
    request.channel_code ?? "",
    serviceTypes,
    requirement?.epv_type_code ?? undefined,
    requirement?.ep_service_type_code ?? undefined,
  )?.label
    ?? serviceOptions.find((option) => option.value === serviceTypes[0])?.label
    ?? serviceTypes[0]
    ?? "-";
  const channel = requestChannel(request);

  return (
    <Link
      href={`/requester/requests/${request.id}`}
      className={`grid min-h-[56px] gap-2 py-4 text-sm transition-colors hover:bg-brand-soft/45 md:grid-cols-[1.25fr_1fr_1fr_1fr_8rem] md:items-center md:gap-4 ${
        fillAvailableHeight ? "flex-1" : "basis-1/3 flex-none"
      }`}
    >
      <span className="truncate font-semibold">
        {patent?.patent_number || request.title || "Request"}
      </span>
      <span className="flex min-w-0 justify-start">
        <RequestChannelBadge
          channelCode={channel.code}
          label={channel.label}
          variant="neutral"
        />
      </span>
      <span className="truncate text-muted-foreground">{service}</span>
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <CalendarDays className="size-4" />
        {formatDate(request.updated_at)}
      </span>
      <RequesterStatusBadge
        status={request.requester_status}
        size="compact"
      />
    </Link>
  );
}

function requestChannel(request: DashboardRequest) {
  if (request.source_mode === "upload") {
    return { code: "upload_files", label: "File" };
  }

  const channels: Record<string, { code: string; label: string }> = {
    ep: { code: "ep", label: "EPO" },
    pct: { code: "pct", label: "WIPO" },
    paris_convention: { code: "paris_convention", label: "Paris" },
    upload_files: { code: "upload_files", label: "File" },
  };

  return channels[request.channel_code ?? ""]
    ?? { code: "", label: "-" };
}

export function DraftsPanel({
  drafts,
  draftCount,
}: {
  drafts: DashboardDraft[];
  draftCount: number;
}) {
  const visibleDrafts = drafts.slice(0, 3);

  return (
    <Card className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl shadow-sm">
      <div className="flex shrink-0 items-center justify-between border-b px-5 py-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Drafts</h2>
          <span className="flex size-6 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
            {draftCount}
          </span>
        </div>
        <Link
          href="/requester/drafts"
          className="flex items-center gap-1 text-xs font-medium text-brand-soft-foreground"
        >
          View all
          <ChevronRight className="size-4" />
        </Link>
      </div>

      {visibleDrafts.length ? (
        <div className="hide-scrollbar flex min-h-0 flex-1 flex-col divide-y overflow-y-auto px-5">
          {visibleDrafts.map((draft) => (
            <Link
              key={draft.id}
              href={`/requester/drafts/${draft.id}`}
              className="flex min-h-[64px] flex-1 items-center gap-3 py-3 text-sm transition-colors hover:bg-brand-soft/45"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <FilePenLine className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">
                  {draftMatter(draft)}
                </span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                  {draft.last_draft_step ?? "Source"} · {formatDate(draft.updated_at)}
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          ))}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center">
          <div>
            <p className="font-medium">No saved drafts</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Work saved from Step 1–3 will appear here.
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}

function draftMatter(draft: DashboardDraft) {
  const payload = draft.draft_payload;
  if (payload?.sourceMode === "patent_search") {
    return payload.selectedPatent?.patentNumber
      || payload.patentQuery
      || draft.request_no;
  }

  const fileCount = payload?.uploadedFiles?.length ?? 0;
  if (fileCount) {
    return `${fileCount} uploaded file${fileCount === 1 ? "" : "s"}`;
  }
  return draft.request_no;
}

const lifecycleItems: Array<{
  status: RequesterLifecycleStatus;
  statKey: keyof Pick<DashboardStats, "responding" | "inProgress" | "completed">;
  href: string;
  rowClassName: string;
  iconClassName: string;
}> = [
  {
    status: "responding",
    statKey: "responding",
    href: "/requester/requests?status=responding",
    rowClassName: "border-border bg-card",
    iconClassName: "bg-sky-600 text-white",
  },
  {
    status: "in_progress",
    statKey: "inProgress",
    href: "/requester/requests?status=in_progress",
    rowClassName: "border-border bg-card",
    iconClassName: "bg-violet-600 text-white",
  },
  {
    status: "completed",
    statKey: "completed",
    href: "/requester/requests?status=completed",
    rowClassName: "border-border bg-card",
    iconClassName: "bg-emerald-600 text-white",
  },
];

export function LifecyclePanel({ stats }: { stats: DashboardStats }) {
  return (
    <Card className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl shadow-sm">
      <div className="shrink-0 border-b px-5 py-4">
        <h2 className="text-lg font-semibold">Request lifecycle</h2>
      </div>
      <div className="hide-scrollbar flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto p-4">
        {lifecycleItems.map((item) => {
          const meta = getRequesterStatusMeta(item.status);

          return (
            <Link
              key={item.status}
              href={item.href}
              className={`grid min-h-[68px] flex-1 grid-cols-[3.25rem_minmax(0,1fr)_auto] items-center rounded-lg border px-3 py-2.5 transition-transform hover:-translate-y-0.5 ${item.rowClassName}`}
            >
              <span
                className={`flex size-10 items-center justify-center rounded-full ${item.iconClassName}`}
              >
                <meta.icon className="size-5" />
              </span>
              <span>
                <span className="block text-xl font-semibold leading-5 text-foreground">
                  {stats[item.statKey]}
                </span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  {meta.label}
                </span>
              </span>
              <ChevronRight className="size-4 text-muted-foreground" />
            </Link>
          );
        })}
      </div>
    </Card>
  );
}
