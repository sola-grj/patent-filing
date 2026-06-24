import Link from "next/link";
import { Suspense } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PmAccessDenied } from "@/features/pm/components/pm-access-denied";
import { PmHeader } from "@/features/pm/components/pm-header";
import { getPmDashboard } from "@/features/pm/queries";
import { formatCurrency, formatDate } from "@/features/requester/format";
import { RequesterStatusBadge } from "@/features/requester/requester-status";

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
    <div className="space-y-8">
      <PmHeader
        title="Operations workspace"
        description="Manage patent translation requests from quote preparation through production start."
        action={
          <Button asChild>
            <Link href="/pm/requests">Open request queue</Link>
          </Button>
        }
      />
      <div className="grid gap-4 md:grid-cols-5">
        {dashboard.buckets.map((bucket) => (
          <Link key={bucket.status} href={`/pm/requests?status=${bucket.status}`}>
            <Card className="transition-colors hover:bg-muted/40">
              <CardHeader className="pb-2">
                <CardTitle className="sr-only">{bucket.status}</CardTitle>
                <RequesterStatusBadge status={bucket.status} size="compact" width="full" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{bucket.count}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Recent requests</CardTitle>
          <Button asChild variant="link" size="sm" className="px-0">
            <Link href="/pm/requests">More</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {dashboard.recentRequests.length ? (
            <div className="divide-y">
              {dashboard.recentRequests.map((request) => {
                const quote = latestBy(request.quotes ?? [], "created_at");
                return (
                  <Link
                    key={request.id}
                    href={`/pm/requests/${request.id}`}
                    className="grid gap-3 py-4 text-sm hover:bg-muted/30 md:grid-cols-[1fr_180px_140px_120px]"
                  >
                    <span>
                      <span className="block font-semibold">{request.title ?? "Untitled request"}</span>
                      <span className="text-xs text-muted-foreground">{request.request_no}</span>
                    </span>
                    <RequesterStatusBadge status={request.pm_status} size="compact" />
                    <span>{quote ? formatCurrency(quote.total_amount, quote.currency ?? "USD") : "-"}</span>
                    <span className="text-right text-muted-foreground">{formatDate(request.updated_at)}</span>
                  </Link>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No active requests yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function latestBy<T extends Record<string, unknown>>(items: T[], key: keyof T) {
  return [...items].sort((left, right) =>
    String(right[key] ?? "").localeCompare(String(left[key] ?? "")),
  )[0] ?? null;
}
