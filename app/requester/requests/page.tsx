import Link from "next/link";
import { Suspense } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PaginationNav } from "@/components/ui/pagination";
import { RequestFilterForm } from "@/features/requester/components/request-filter-form";
import { RequesterHeader } from "@/features/requester/components/requester-header";
import { formatCurrency, formatDate } from "@/features/requester/format";
import {
  sourceLanguageOptions,
  targetLanguageOptions,
} from "@/features/requester/options";
import { getRequesterRequests } from "@/features/requester/queries";
import { buildFreshRequestHref } from "@/features/requester/requester-routes";
import { RequesterStatusBadge } from "@/features/requester/requester-status";

export default async function RequesterRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string }>;
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
  searchParams: Promise<{ status?: string; q?: string; page?: string }>;
}) {
  const params = await searchParams;
  const page = Number(params.page ?? "1");
  const { organization, requests, totalCount, totalPages } = await getRequesterRequests({
    status: params.status,
    q: params.q,
    page: Number.isFinite(page) ? page : 1,
  });

  if (!organization) {
    return <RequesterHeader title="Requests" description="Create a requester workspace from the dashboard first." />;
  }

  return (
    <div className="space-y-8">
      <RequesterHeader title="My requests" description="Track patent translation requests from draft through quote and order." />
      <RequestFilterForm status={params.status} query={params.q} />
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{totalCount} requests found</span>
        <span>Page {Math.min(Math.max(1, page || 1), totalPages)} of {totalPages}</span>
      </div>
      <Card>
        <CardContent className="p-0">
          {requests.length ? (
            <div className="divide-y">
              {requests.map((request) => {
                const latestQuote = [...(request.quotes ?? [])].sort((a, b) =>
                  String(b.created_at).localeCompare(String(a.created_at)),
                )[0];
                const requirement = Array.isArray(request.translation_requirements)
                  ? request.translation_requirements[0]
                  : request.translation_requirements;
                const languagePair = formatLanguagePair(
                  requirement?.source_language,
                  requirement?.target_language,
                );

                return (
                  <Link key={request.id} href={`/requester/requests/${request.id}`} className="grid gap-3 p-4 text-sm hover:bg-muted/50 md:grid-cols-[1.4fr_1fr_1fr_1fr_auto]">
                    <span>
                      <span className="block text-base font-semibold text-foreground">
                        {request.title ?? "Untitled request"}
                      </span>
                      <span className="block text-xs font-normal text-muted-foreground">
                        {request.request_no}
                      </span>
                    </span>
                    <RequesterStatusBadge status={request.requester_status} />
                    <span>{request.request_files?.length ?? 0} files</span>
                    <span>{languagePair}</span>
                    <span className="text-right">
                      {latestQuote ? formatCurrency(latestQuote.total_amount, latestQuote.currency ?? "USD") : "-"}
                      <span className="block text-muted-foreground">{formatDate(request.updated_at)}</span>
                    </span>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="flex items-center justify-between p-6">
              <p className="text-sm text-muted-foreground">No requests match the current filters.</p>
              <Button asChild><Link href={buildFreshRequestHref()}>Create request</Link></Button>
            </div>
          )}
        </CardContent>
      </Card>
      <PaginationNav
        currentPage={Math.min(Math.max(1, page || 1), totalPages)}
        totalPages={totalPages}
        buildHref={(pageNumber) => buildPageHref(pageNumber, params.status, params.q)}
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

  return `/requester/requests?${searchParams.toString()}`;
}

function formatLanguagePair(
  sourceLanguage?: string | null,
  targetLanguage?: string | null,
) {
  const source = findLanguageLabel(sourceLanguage, sourceLanguageOptions);
  const target = findLanguageLabel(targetLanguage, targetLanguageOptions);

  if (!source && !target) {
    return "-";
  }
  if (!source) {
    return `- → ${target}`;
  }
  if (!target) {
    return `${source} → -`;
  }

  return `${source} → ${target}`;
}

function findLanguageLabel(
  value: string | null | undefined,
  options: Array<{ value: string; label: string }>,
) {
  if (!value) {
    return null;
  }

  return options.find((option) => option.value === value)?.label ?? value;
}
