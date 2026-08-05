import { Suspense } from "react";

import { PaginationNav } from "@/components/ui/pagination";
import { PmAccessDenied } from "@/features/pm/components/pm-access-denied";
import { PmHeader } from "@/features/pm/components/pm-header";
import { PmRequestFilterForm } from "@/features/pm/components/pm-request-filter-form";
import { getPmRequests, normalizePmStatusFilter } from "@/features/pm/queries";
import { RequestListEmptyState } from "@/features/requests/components/request-list-empty-state";
import {
  RequestListRow,
  RequestListTable,
} from "@/features/requests/components/request-list-table";
import {
  RequestChannelBadge,
  RequestServiceBadge,
} from "@/features/requester/components/request-summary-badges";
import { UrgentBadge } from "@/features/requester/components/urgent-badge";
import { formatCurrency, formatDate } from "@/features/requester/format";
import { buildFreshRequestHref } from "@/features/requester/requester-routes";
import { RequesterStatusBadge } from "@/features/requester/requester-status";

const requestGridClassName =
  "grid grid-cols-[minmax(15rem,1.6fr)_minmax(12rem,1.15fr)_minmax(7rem,0.7fr)_minmax(11rem,1.1fr)_minmax(10rem,0.9fr)_minmax(7rem,0.65fr)_minmax(9rem,0.75fr)]";

type PmHomeSearchParams = {
  status?: string;
  channel?: string;
  customer?: string;
  q?: string;
  page?: string;
};

export default function PmDashboardPage({
  searchParams,
}: {
  searchParams: Promise<PmHomeSearchParams>;
}) {
  return (
    <Suspense
      fallback={
        <p className="text-sm text-muted-foreground">Loading PM workspace...</p>
      }
    >
      <PmDashboardContent searchParams={searchParams} />
    </Suspense>
  );
}

async function PmDashboardContent({
  searchParams,
}: {
  searchParams: Promise<PmHomeSearchParams>;
}) {
  const params = await searchParams;
  const requestedPage = Number(params.page ?? "1");
  const status = normalizePmStatusFilter(params.status);
  const result = await getPmRequests({
    status,
    channel: params.channel,
    customer: params.customer,
    q: params.q,
    page: Number.isFinite(requestedPage) ? requestedPage : 1,
  });

  if (result.denied) {
    return <PmAccessDenied />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-5 overflow-hidden">
      <PmHeader
        title="Operations workspace"
        description="Manage patent translation requests from quote preparation through production start."
      />
      <PmRequestFilterForm
        channels={result.dictionaries.channels}
        customers={result.customers}
        customer={params.customer}
        channel={params.channel}
        status={status}
        query={params.q}
      />
      <div className="flex shrink-0 items-center justify-between text-sm text-muted-foreground">
        <span>{result.totalCount} requests</span>
        <span>
          Page {result.page} of {result.totalPages}
        </span>
      </div>
      <RequestListTable
        columns={[
          "Matter / Request No.",
          "Customer",
          "Channel",
          "Service",
          "PM Status",
          "Quote",
          "Updated",
        ]}
        gridClassName={requestGridClassName}
        minWidthClassName="min-w-[1180px]"
        hasRows={result.requests.length > 0}
        emptyState={<RequestListEmptyState actionHref={buildFreshRequestHref()} />}
      >
        {result.requests.map((request) => {
          const quote = latestBy(request.quotes ?? [], "created_at");
          const organization = firstRelation(request.organizations);
          const requirement = firstRelation(request.translation_requirements);
          const patent = firstRelation(request.request_patents);
          const channelLabel = dictionaryLabel(
            result.dictionaries.channels,
            request.channel_code,
          );

          return (
            <RequestListRow
              key={request.id}
              href={`/pm/${request.id}`}
              gridClassName={requestGridClassName}
            >
              <span className="min-w-0">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-base font-semibold text-foreground">
                    {patent?.patent_number || request.title?.trim() || "Request"}
                  </span>
                  {requirement?.is_urgent ? (
                    <UrgentBadge className="shrink-0" />
                  ) : null}
                </span>
                <span className="mt-1 block truncate text-xs text-muted-foreground">
                  {request.request_no}
                </span>
              </span>
              <span className="truncate">{organization?.name ?? "-"}</span>
              <span className="min-w-0">
                <RequestChannelBadge
                  channelCode={request.channel_code}
                  label={channelLabel}
                  variant="neutral"
                />
              </span>
              <span className="min-w-0">
                <RequestServiceBadge
                  serviceTypes={requirement?.service_types ?? []}
                  serviceOptions={result.dictionaries.serviceTypes}
                />
              </span>
              <RequesterStatusBadge status={request.pm_status} size="compact" />
              <span className="whitespace-nowrap">
                {quote
                  ? formatCurrency(quote.total_amount, quote.currency ?? "USD")
                  : "-"}
              </span>
              <span className="whitespace-nowrap text-muted-foreground">
                {formatDate(request.updated_at)}
              </span>
            </RequestListRow>
          );
        })}
      </RequestListTable>
      <div className="shrink-0 pt-1">
        <PaginationNav
          currentPage={result.page}
          totalPages={result.totalPages}
          buildHref={(page) => buildPageHref(page, params)}
        />
      </div>
    </div>
  );
}

function buildPageHref(page: number, filters: PmHomeSearchParams) {
  const searchParams = new URLSearchParams();
  for (const key of ["status", "channel", "customer", "q"] as const) {
    const value = filters[key]?.trim();
    if (value && value !== "all") {
      searchParams.set(key, value);
    }
  }
  searchParams.set("page", String(page));
  return `/pm?${searchParams.toString()}`;
}

function dictionaryLabel(
  options: Array<{ value: string; label: string }>,
  value?: string | null,
) {
  if (!value) return "-";
  return options.find((option) => option.value === value)?.label ?? value;
}

function latestBy<T extends Record<string, unknown>>(items: T[], key: keyof T) {
  return [...items].sort((left, right) =>
    String(right[key] ?? "").localeCompare(String(left[key] ?? "")),
  )[0] ?? null;
}

function firstRelation<T>(value?: T | T[] | null) {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}
