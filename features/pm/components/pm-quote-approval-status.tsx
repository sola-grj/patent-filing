import { PmApprovalReviewForm } from "@/features/pm/components/pm-approval-review-form";

type Approval = {
  id: string;
  status: string;
  submitted_at: string;
  decision_reason?: string | null;
  reviewed_at?: string | null;
  sent_at?: string | null;
};

export function PmQuoteApprovalStatus({ approval, canReview }: { approval?: Approval | null; canReview: boolean }) {
  if (!approval) return null;
  return <section className="rounded-xl border bg-card p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="font-semibold">Quotation change approval</h3><p className="mt-1 text-sm text-muted-foreground">Submitted {new Date(approval.submitted_at).toLocaleString("en-US")}</p></div>
      <span className="rounded-full border px-3 py-1 text-xs font-medium capitalize">{approval.sent_at ? "sent" : approval.status}</span>
    </div>
    {approval.decision_reason ? <p className="mt-4 rounded-md bg-muted/40 p-3 text-sm"><span className="font-medium">Decision reason:</span> {approval.decision_reason}</p> : null}
    {canReview && approval.status === "pending" ? <PmApprovalReviewForm approvalId={approval.id} /> : null}
  </section>;
}
