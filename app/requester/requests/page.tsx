import { redirect } from "next/navigation";
import { Suspense } from "react";

import { PaginationNav } from "@/components/ui/pagination";
import { RequestListEmptyState } from "@/features/requests/components/request-list-empty-state";
import {
  RequestListRow,
  RequestListTable,
} from "@/features/requests/components/request-list-table";
import { RequestFilterForm } from "@/features/requester/components/request-filter-form";
import {
  RequestChannelBadge,
  RequestServiceBadge,
} from "@/features/requester/components/request-summary-badges";
import { RequesterHeader } from "@/features/requester/components/requester-header";
import { UrgentBadge } from "@/features/requester/components/urgent-badge";
import { formatCurrency, formatDate } from "@/features/requester/format";
import { getRequesterRequests } from "@/features/requester/queries";
import { buildFreshRequestHref } from "@/features/requester/requester-routes";
import { RequesterStatusBadge } from "@/features/requester/requester-status";

const requestGridClassName =
  "grid grid-cols-[minmax(17rem,1.7fr)_minmax(7rem,0.7fr)_minmax(11rem,1.1fr)_minmax(10rem,0.9fr)_minmax(7rem,0.65fr)_minmax(9rem,0.75fr)]";

export default async function RequesterRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    channel?: string;
    q?: string;
    page?: string;
    from?: string;
  }>;
}) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading requests...</p>}>
      <RequestsContent searchParams={searchParams} />
    </Suspense>
  );
}

async function RequestsContent({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    channel?: string;
    q?: string;
    page?: string;
    from?: string;
  }>;
}) {
  const params = await searchParams;
  const page = Number(params.page ?? "1");
  const {
    organization,
    requests,
    totalCount,
    totalPages,
    page: currentPage,
    dictionaries,
  } = await getRequesterRequests({
    status: params.status,
    channel: params.channel,
    q: params.q,
    page: Number.isFinite(page) ? page : 1,
  });

  if (!organization) {
    return <RequesterHeader title="Requests" description="Create a requester workspace from the dashboard first." />;
  }

  const dashboardQuery = params.q?.trim();
  if (
    params.from === "dashboard" &&
    dashboardQuery &&
    totalCount === 0
  ) {
    redirect(buildFreshRequestHref(Date.now(), dashboardQuery));
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-6 overflow-hidden">
      <RequesterHeader title="My requests" description="Track patent translation requests from draft through quote and order." />
      <RequestFilterForm
        channels={dictionaries?.channels ?? []}
        channel={params.channel}
        status={params.status}
        query={params.q}
      />
      <div className="shrink-0 flex items-center justify-between text-sm text-muted-foreground">
        <span>{totalCount} requests found</span>
        <span>Page {currentPage} of {totalPages}</span>
      </div>
      <RequestListTable
        columns={[
          "Matter / Request No.",
          "Channel",
          "Service",
          "Status",
          "Quote",
          "Updated",
        ]}
        gridClassName={requestGridClassName}
        minWidthClassName="min-w-[980px]"
        hasRows={requests.length > 0}
        emptyState={<RequestListEmptyState actionHref={buildFreshRequestHref()} />}
      >
        {requests.map((request) => {
          const latestQuote = [...(request.quotes ?? [])].sort((a, b) =>
            String(b.created_at).localeCompare(String(a.created_at)),
          )[0];
          const requirement = Array.isArray(request.translation_requirements)
            ? request.translation_requirements[0]
            : request.translation_requirements;
          const patent = Array.isArray(request.request_patents)
            ? request.request_patents[0]
            : request.request_patents;
          const channel = dictionaryLabel(
            dictionaries?.channels ?? [],
            request.channel_code,
          );

          return (
            <RequestListRow
              key={request.id}
              href={`/requester/requests/${request.id}`}
              gridClassName={requestGridClassName}
            >
              <span className="min-w-0">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-base font-semibold text-foreground">
                    {patent?.patent_number || request.title?.trim() || "Request"}
                  </span>
                  {requirement?.is_urgent ? <UrgentBadge className="shrink-0" /> : null}
                </span>
                <span className="mt-1 block truncate text-xs text-muted-foreground">
                  {request.request_no}
                  {" · "}
                  {request.request_files?.length ?? 0} files
                </span>
              </span>
              <span className="min-w-0">
                <RequestChannelBadge
                  channelCode={request.channel_code}
                  label={channel}
                  variant="neutral"
                />
              </span>
              <span className="min-w-0">
                <RequestServiceBadge
                  serviceTypes={requirement?.service_types ?? []}
                  serviceOptions={dictionaries?.serviceTypes ?? []}
                />
              </span>
              <RequesterStatusBadge status={request.requester_status} size="compact" />
              <span className="whitespace-nowrap">
                {latestQuote
                  ? formatCurrency(latestQuote.total_amount, latestQuote.currency ?? "USD")
                  : "-"}
              </span>
              <span className="whitespace-nowrap text-muted-foreground">
                {formatDate(request.updated_at)}
              </span>
            </RequestListRow>
          );
        })}
      </RequestListTable>
      <div className="shrink-0 pt-2">
        <PaginationNav
          currentPage={currentPage}
          totalPages={totalPages}
          buildHref={(pageNumber) => buildPageHref(pageNumber, params)}
        />
      </div>
    </div>
  );
}

function buildPageHref(
  page: number,
  filters: { status?: string; channel?: string; q?: string },
) {
  const searchParams = new URLSearchParams();

  for (const key of ["status", "channel", "q"] as const) {
    const value = filters[key]?.trim();
    if (value && value !== "all") {
      searchParams.set(key, value);
    }
  }
  searchParams.set("page", String(page));

  return `/requester/requests?${searchParams.toString()}`;
}

function dictionaryLabel(
  options: Array<{ value: string; label: string }>,
  value?: string | null,
) {
  if (!value) return "-";
  return options.find((option) => option.value === value)?.label ?? value;
}
