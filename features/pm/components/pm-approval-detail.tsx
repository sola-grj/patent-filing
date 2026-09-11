import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PmApprovalReviewForm } from "@/features/pm/components/pm-approval-review-form";
import { PmHeader } from "@/features/pm/components/pm-header";
import { PmQuoteSheet } from "@/features/pm/components/pm-quote-sheet";
import { cn } from "@/lib/utils";

type Relation<T> = T | T[] | null;
type Profile = { display_name?: string | null; email?: string | null };
type Quote = {
  id?: string;
  version_no?: number;
  status?: string | null;
  notes?: string | null;
  currency?: string | null;
  total_amount?: number | string | null;
  breakdown_json?: unknown;
  pricing_snapshot?: unknown;
  quote_items?: Array<{ label: string; amount: number | string }> | null;
};

type ApprovalDetail = {
  id: string;
  approval_type: string;
  status: string;
  submitted_at: string;
  reviewed_at?: string | null;
  decision_reason?: string | null;
  sent_at?: string | null;
  payload_snapshot?: unknown;
  previousQuote?: Quote | null;
  submitter?: Profile | null;
  reviewer?: Profile | null;
  translation_requests?: Relation<{
    request_no?: string;
    title?: string | null;
    organizations?: Relation<{ name?: string | null }>;
    translation_requirements?: Relation<{
      ep_service_type_code?: string | null;
      translation_required?: boolean | null;
      config_snapshot?: unknown;
    }>;
  }>;
  quotes?: Relation<Quote>;
};

export function PmApprovalDetail({ approval }: { approval: ApprovalDetail }) {
  const request = first(approval.translation_requests);
  const organization = first(request?.organizations);
  const requirement = first(request?.translation_requirements);
  const payload = record(approval.payload_snapshot);
  const liveQuote = first(approval.quotes);
  const quote = snapshotQuote(payload.quote, payload.items) ?? liveQuote;
  const snapshotSourceQuote = snapshotQuote(payload.source_quote);
  const sourceQuote = approval.previousQuote
    ?? (snapshotSourceQuote?.version_no === (quote?.version_no ?? 0) - 1 ? snapshotSourceQuote : null);
  const quoteVersions = sourceQuote && quote ? [sourceQuote, quote] : quote ? [quote] : [];
  const config = record(requirement?.config_snapshot);
  const epServiceType = stringValue(requirement?.ep_service_type_code)
    ?? stringValue(config.epServiceType);
  const translationRequired = requirement?.translation_required
    ?? booleanValue(config.translationRequired)
    ?? true;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="grid gap-6 pb-8">
        <PmHeader
          showEyebrow={false}
          title={request?.request_no ?? "Approval detail"}
          description={`${organization?.name ?? "Customer"} · Quotation change submitted by ${profileName(approval.submitter)}`}
          status={<StatusBadge status={approval.sent_at ? "sent" : approval.status} />}
          action={(
            <Link
              href="/pm/approvals"
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "w-fit")}
            >
              <ArrowLeft className="size-4" />
              Back to approvals
            </Link>
          )}
        />
        <Card className="overflow-hidden">
          <section className="p-6">
            <h2 className="text-lg font-semibold">Approval information</h2>
            <div className="mt-5 grid gap-5 text-sm md:grid-cols-2 xl:grid-cols-4">
              <Fact label="Customer" value={organization?.name ?? "-"} />
              <Fact label="Submitted PM" value={profileName(approval.submitter)} />
              <Fact label="Approval type" value="Quotation change" />
              <Fact label="Submitted" value={formatDateTime(approval.submitted_at)} />
              {approval.reviewed_at ? <Fact label="Reviewed" value={formatDateTime(approval.reviewed_at)} /> : null}
              {approval.reviewer ? <Fact label="Reviewed by" value={profileName(approval.reviewer)} /> : null}
              {approval.decision_reason ? <div className="md:col-span-2"><Fact label="Decision reason" value={approval.decision_reason} /></div> : null}
            </div>
          </section>
          <section className="border-t [&>div]:rounded-none [&>div]:border-0 [&>div]:shadow-none">
            <PmQuoteSheet
              quote={quote}
              quotes={quoteVersions}
              isEpGranting={epServiceType === "ep_granting"}
              isUnitaryPatent={epServiceType === "unitary_patent"}
              translationRequired={translationRequired}
            />
          </section>
          {approval.status === "pending" ? (
            <section className="border-t p-6">
              <h2 className="text-lg font-semibold">Review decision</h2>
              <PmApprovalReviewForm approvalId={approval.id} />
            </section>
          ) : null}
        </Card>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return <span className="rounded-full border px-3 py-1 text-xs font-medium capitalize">{status}</span>;
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div><p className="text-muted-foreground">{label}</p><p className="mt-1 font-medium">{value}</p></div>;
}

function first<T>(value?: Relation<T>) {
  return !value ? null : Array.isArray(value) ? value[0] ?? null : value;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function snapshotQuote(value: unknown, items?: unknown): Quote | null {
  const quote = record(value);
  const id = stringValue(quote.id);
  if (!id) return null;
  return {
    id,
    version_no: numberValue(quote.version_no) ?? undefined,
    status: stringValue(quote.status),
    notes: stringValue(quote.notes),
    currency: stringValue(quote.currency),
    total_amount: amountValue(quote.total_amount),
    breakdown_json: quote.breakdown_json,
    pricing_snapshot: quote.pricing_snapshot,
    quote_items: Array.isArray(items)
      ? items.flatMap((item) => {
          const row = record(item);
          const label = stringValue(row.label);
          const amount = amountValue(row.amount);
          return label && amount !== null ? [{ label, amount }] : [];
        })
      : null,
  };
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function booleanValue(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function numberValue(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function amountValue(value: unknown): number | string | null {
  return typeof value === "number" || typeof value === "string" ? value : null;
}

function profileName(profile?: Profile | null) {
  return profile?.display_name || profile?.email || "Unknown PM";
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
