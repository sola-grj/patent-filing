import { Suspense } from "react";

import { getQuoteRevisionApprovals } from "@/features/pm/approval-queries";
import { PmAccessDenied } from "@/features/pm/components/pm-access-denied";
import { PmApprovalFilterForm } from "@/features/pm/components/pm-approval-filter-form";
import { PmApprovalList } from "@/features/pm/components/pm-approval-list";
import { PmApprovalsRealtimeRefresh } from "@/features/pm/components/pm-approvals-realtime-refresh";
import { PmHeader } from "@/features/pm/components/pm-header";

type ApprovalSearchParams = {
  customer?: string;
  pm?: string;
  status?: string;
  q?: string;
  page?: string;
};

export default function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<ApprovalSearchParams>;
}) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading approvals...</p>}>
      <ApprovalsContent searchParams={searchParams} />
    </Suspense>
  );
}

async function ApprovalsContent({
  searchParams,
}: {
  searchParams: Promise<ApprovalSearchParams>;
}) {
  const params = await searchParams;
  const status = normalizeStatus(params.status);
  const result = await getQuoteRevisionApprovals({
    customer: params.customer,
    pm: params.pm,
    status,
    q: params.q,
    page: Number(params.page) || 1,
  });
  if (result.denied) return <PmAccessDenied />;

  return (
    <div className="flex h-full min-h-0 flex-col gap-5 overflow-hidden">
      <PmApprovalsRealtimeRefresh userId={result.userId} />
      <PmHeader title="Approvals" description="Review operational approvals by category." />
      <PmApprovalFilterForm
        customers={result.customers}
        pms={result.pms}
        customer={params.customer}
        pm={params.pm}
        status={status}
        query={params.q}
      />
      <PmApprovalList
        items={result.items}
        page={result.page}
        totalPages={result.totalPages}
        totalCount={result.totalCount}
        filters={{ ...params, status }}
      />
    </div>
  );
}

function normalizeStatus(value?: string) {
  return ["pending", "approved", "rejected", "cancelled", "sent"].includes(value ?? "")
    ? value
    : undefined;
}
