import { notFound } from "next/navigation";

import { getQuoteRevisionApprovalDetail } from "@/features/pm/approval-queries";
import { PmAccessDenied } from "@/features/pm/components/pm-access-denied";
import { PmApprovalDetail } from "@/features/pm/components/pm-approval-detail";

export default async function ApprovalDetailPage({
  params,
}: {
  params: Promise<{ approvalId: string }>;
}) {
  const { approvalId } = await params;
  const result = await getQuoteRevisionApprovalDetail(approvalId);
  if (result.denied) return <PmAccessDenied />;
  if (!result.approval) notFound();

  return <PmApprovalDetail approval={result.approval} />;
}
