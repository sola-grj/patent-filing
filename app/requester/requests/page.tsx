import Link from "next/link";
import { Suspense } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { RequestFilterForm } from "@/features/requester/components/request-filter-form";
import { RequesterHeader } from "@/features/requester/components/requester-header";
import { StatusBadge, formatCurrency, formatDate } from "@/features/requester/format";
import { getRequesterRequests } from "@/features/requester/queries";

export default async function RequesterRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
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
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const params = await searchParams;
  const { organization, requests } = await getRequesterRequests(params);

  if (!organization) {
    return <RequesterHeader title="Requests" description="Create a requester workspace from the dashboard first." />;
  }

  return (
    <div className="space-y-8">
      <RequesterHeader title="My requests" description="Track patent translation requests from draft through quote and order." />
      <RequestFilterForm status={params.status} query={params.q} />
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

                return (
                  <Link key={request.id} href={`/requester/requests/${request.id}`} className="grid gap-3 p-4 text-sm hover:bg-muted/50 md:grid-cols-[1.4fr_1fr_1fr_1fr_auto]">
                    <span>
                      <strong>{request.request_no}</strong>
                      <span className="block text-muted-foreground">{request.title ?? "Untitled request"}</span>
                    </span>
                    <StatusBadge status={request.requester_status} />
                    <span>{request.request_files?.length ?? 0} files</span>
                    <span>{requirement?.target_language ?? "-"}</span>
                    <span className="text-right">
                      {latestQuote ? formatCurrency(latestQuote.total_amount, latestQuote.currency) : "-"}
                      <span className="block text-muted-foreground">{formatDate(request.updated_at)}</span>
                    </span>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="flex items-center justify-between p-6">
              <p className="text-sm text-muted-foreground">No requests match the current filters.</p>
              <Button asChild><Link href="/requester/requests/new">Create request</Link></Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
