import Link from "next/link";
import { Suspense } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { PaginationNav } from "@/components/ui/pagination";
import { PmAccessDenied } from "@/features/pm/components/pm-access-denied";
import { PmHeader } from "@/features/pm/components/pm-header";
import { PmRequestFilterForm } from "@/features/pm/components/pm-request-filter-form";
import { getPmRequests, normalizePmStatusFilter } from "@/features/pm/queries";
import { formatCurrency, formatDate } from "@/features/requester/format";
import { RequesterStatusBadge } from "@/features/requester/requester-status";

export default function PmRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; stage?: string; q?: string; page?: string }>;
}) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading request queue...</p>}>
      <PmRequestsContent searchParams={searchParams} />
    </Suspense>
  );
}

async function PmRequestsContent({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; stage?: string; q?: string; page?: string }>;
}) {
  const params = await searchParams;
  const page = Number(params.page ?? "1");
  const normalizedStatus = normalizePmStatusFilter(params.status, params.stage);
  const result = await getPmRequests({
    status: normalizedStatus,
    stage: params.stage,
    q: params.q,
    page: Number.isFinite(page) ? page : 1,
  });

  if (result.denied) {
    return <PmAccessDenied />;
  }

  return (
    <div className="space-y-8">
      <PmHeader
        title="Request queue"
        description="Prioritize configured requests, negotiations, and accepted quote follow-up."
      />
      <PmRequestFilterForm status={normalizedStatus} query={params.q} />
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{result.totalCount} requests found</span>
        <span>Page {result.page} of {result.totalPages}</span>
      </div>
      <Card>
        <CardContent className="p-0">
          {result.requests.length ? (
            <div className="divide-y">
              {result.requests.map((request) => {
                const quote = latestBy(request.quotes ?? [], "created_at");
                const organization = firstRelation(request.organizations);
                return (
                  <Link
                    key={request.id}
                    href={`/pm/requests/${request.id}`}
                    className="grid gap-3 p-4 text-sm hover:bg-muted/50 md:grid-cols-[1.2fr_1fr_180px_120px_140px]"
                  >
                    <span>
                      <span className="block text-base font-semibold text-foreground">
                        {request.title ?? "Untitled request"}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {request.request_no}
                      </span>
                    </span>
                    <span>{organization?.name ?? "-"}</span>
                    <RequesterStatusBadge status={request.pm_status} size="compact" />
                    <span>{quote ? formatCurrency(quote.total_amount, quote.currency ?? "USD") : "-"}</span>
                    <span className="text-right text-muted-foreground">{formatDate(request.updated_at)}</span>
                  </Link>
                );
              })}
            </div>
          ) : (
            <p className="p-6 text-sm text-muted-foreground">
              No requests match the current filters.
            </p>
          )}
        </CardContent>
      </Card>
      <PaginationNav
        currentPage={result.page}
        totalPages={result.totalPages}
        buildHref={(pageNumber) => buildPageHref(pageNumber, normalizedStatus, params.q)}
      />
    </div>
  );
}

function buildPageHref(page: number, status?: string, query?: string) {
  const searchParams = new URLSearchParams();

  if (status && status !== "all") {
    searchParams.set("status", status);
  }
  if (query?.trim()) {
    searchParams.set("q", query.trim());
  }
  searchParams.set("page", String(page));

  return `/pm/requests?${searchParams.toString()}`;
}

function latestBy<T extends Record<string, unknown>>(items: T[], key: keyof T) {
  return [...items].sort((left, right) =>
    String(right[key] ?? "").localeCompare(String(left[key] ?? "")),
  )[0] ?? null;
}

function firstRelation<T>(value?: T | T[] | null) {
  if (!value) {
    return null;
  }

  return Array.isArray(value) ? (value[0] ?? null) : value;
}
