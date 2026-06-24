import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  generatePmQuote,
  respondToNegotiation,
  startNegotiationFromPm,
} from "@/features/pm/actions";
import {
  StatusBadge,
  formatCurrency,
  formatDate,
  titleCaseStatus,
} from "@/features/requester/format";
import {
  purposeOptions,
  qualityOptions,
  scopeOptions,
  sourceLanguageOptions,
  targetLanguageOptions,
} from "@/features/requester/options";
import { RequesterStatusBadge } from "@/features/requester/requester-status";

import { PmCloseRequestDialog } from "./pm-close-request-dialog";
import { PmHeader } from "./pm-header";
import { PmDeliveryPanel } from "./pm-delivery-panel";
import { PmTaskPanel } from "./pm-task-panel";

type RequestFile = {
  id: string;
  original_filename: string;
  confirmed_for_translation?: boolean | null;
  status?: string | null;
  file_role?: string | null;
  language?: string | null;
  source?: string | null;
  file_parse_results?: ParseResult | ParseResult[] | null;
};

type ParseResult = {
  word_count?: number | null;
  page_count?: number | null;
  claim_count?: number | null;
  parse_status?: string | null;
};

type Quote = {
  id: string;
  version_no: number;
  status?: string | null;
  total_amount?: number | string | null;
  currency?: string | null;
  estimated_delivery_at?: string | null;
  valid_until?: string | null;
  quote_items?: QuoteItem[] | null;
};

type QuoteItem = {
  id: string;
  label: string;
  amount: number | string;
  description?: string | null;
};

type Negotiation = {
  id: string;
  initiated_by?: string | null;
  quote_id?: string | null;
  expected_amount?: number | string | null;
  expected_delivery_at?: string | null;
  adjustment_notes?: string | null;
  pm_decision?: string | null;
  status?: string | null;
  response_quote_id?: string | null;
  created_at: string;
  quote_negotiation_messages?: Array<{
    id: string;
    body?: string | null;
    created_at: string;
  }> | null;
};

type Requirement = {
  source_language?: string | null;
  target_language?: string | null;
  scope_type?: string | null;
  purpose?: string | null;
  quality_level?: string | null;
  delivery_option?: string | null;
  due_at?: string | null;
  is_urgent?: boolean | null;
  scope_details?: { customScope?: string } | null;
};

type Order = {
  id: string;
  order_no?: string | null;
  status?: string | null;
  offline_confirmation_status?: string | null;
  confirmed_at?: string | null;
  started_at?: string | null;
  translation_tasks?: Array<{
    id: string;
    request_file_id?: string | null;
    assigned_translator_id?: string | null;
    status?: string | null;
    task_type?: string | null;
    started_at?: string | null;
    task_deliverables?: Array<{
      id: string;
      version_no?: number | null;
      status?: string | null;
      storage_path?: string | null;
      created_at?: string | null;
      language?: string | null;
    }> | null;
  }> | null;
};

type RequestEvent = {
  id: string;
  event_type: string;
  from_status?: string | null;
  to_status?: string | null;
  created_at: string;
};

type PmRequestDetailProps = {
  request: {
    id: string;
    request_no: string;
    title?: string | null;
    workflow_stage?: string | null;
    requester_status?: string | null;
    pm_status?: string | null;
    submitted_at?: string | null;
    updated_at?: string | null;
    organizations?: { name?: string | null } | Array<{ name?: string | null }> | null;
    request_files?: RequestFile[] | null;
    translation_requirements?: Requirement | Requirement[] | null;
    quotes?: Quote[] | null;
    quote_negotiations?: Negotiation[] | null;
    orders?: Order | Order[] | null;
    request_events?: RequestEvent[] | null;
  };
  translators: Array<{
    userId: string;
    label: string;
    email: string | null;
    isSelectable: boolean;
  }>;
  currentUserId: string | null;
};

export function PmRequestDetail({
  request,
  translators,
  currentUserId,
}: PmRequestDetailProps) {
  const organization = firstRelation(request.organizations);
  const requirement = firstRelation(request.translation_requirements);
  const latestQuote = latestBy(request.quotes ?? [], "version_no");
  const acceptedQuote =
    [...(request.quotes ?? [])]
      .filter((quote) => quote.status === "accepted")
      .sort((left, right) => right.version_no - left.version_no)[0] ?? null;
  const order = firstRelation(request.orders);
  const files = request.request_files ?? [];
  const quoteById = new Map((request.quotes ?? []).map((quote) => [quote.id, quote]));
  const negotiations = [...(request.quote_negotiations ?? [])].sort((left, right) =>
    new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
  );
  const events = [...(request.request_events ?? [])].sort((left, right) =>
    new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
  );

  return (
    <div className="flex flex-col gap-8 xl:min-h-[calc(100dvh-9rem)] xl:overflow-hidden">
      <PmHeader
        title={request.title ?? request.request_no}
        description={`${request.request_no} · ${organization?.name ?? "Customer organization"}`}
        action={<PmCloseRequestDialog requestId={request.id} />}
      />
      <div className="grid gap-6 xl:min-h-0 xl:flex-1 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-stretch">
        <div className="hide-scrollbar flex flex-col gap-6 xl:min-h-0 xl:h-full xl:overflow-y-auto xl:pr-2">
          <Section title="Request overview">
            <InfoGrid
              items={[
                { label: "Current status", value: <RequesterStatusBadge status={request.pm_status} size="compact" /> },
                { label: "Submitted", value: formatDate(request.submitted_at) },
                { label: "Updated", value: formatDate(request.updated_at) },
                { label: "Organization", value: organization?.name ?? "-" },
              ]}
            />
          </Section>
          <Section
            title="Files and parsing"
            cardClassName="flex h-[32rem] min-h-0 flex-col overflow-hidden"
            headerClassName="sticky top-0 z-10 flex flex-row items-center justify-between gap-3 space-y-0 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85"
            contentClassName="hide-scrollbar min-h-0 flex-1 overflow-y-auto"
            action={
              files.length ? (
                <Button asChild variant="outline" size="sm">
                  <a href={`/pm/requests/${request.id}/download`}>Download zip</a>
                </Button>
              ) : null
            }
          >
            {files.length ? (
              <div className="space-y-3">
                {files.map((file) => (
                  <FileRow key={file.id} file={file} />
                ))}
              </div>
            ) : (
              <EmptyState>No files attached.</EmptyState>
            )}
          </Section>
          <Section title="Translation configuration">
            <InfoGrid
              items={[
                { label: "Language pair", value: `${labelFor(sourceLanguageOptions, requirement?.source_language)} -> ${labelFor(targetLanguageOptions, requirement?.target_language)}` },
                { label: "Scope", value: labelFor(scopeOptions, requirement?.scope_type) },
                { label: "Purpose", value: labelFor(purposeOptions, requirement?.purpose) },
                { label: "Quality", value: labelFor(qualityOptions, requirement?.quality_level) },
                { label: "Delivery", value: titleCaseStatus(requirement?.delivery_option) },
                { label: "Due date", value: formatDate(requirement?.due_at) },
                { label: "Urgent", value: requirement?.is_urgent ? "Yes" : "No" },
                { label: "Notes", value: requirement?.scope_details?.customScope ?? "-" },
              ]}
            />
          </Section>
          <Section title="Negotiation history">
            {negotiations.length ? (
              <div className="space-y-4">
                {negotiations.map((negotiation) => (
                  <NegotiationCard
                    key={negotiation.id}
                    currentUserId={currentUserId}
                    requestId={request.id}
                    negotiation={negotiation}
                    currency={latestQuote?.currency ?? "USD"}
                    sourceQuote={negotiation.quote_id ? quoteById.get(negotiation.quote_id) ?? null : latestQuote}
                  />
                ))}
              </div>
            ) : (
              <EmptyState>No negotiation rounds yet.</EmptyState>
            )}
          </Section>
          <Section
            title="Event timeline"
            cardClassName="flex min-h-0 flex-1 flex-col overflow-hidden"
            headerClassName="sticky top-0 z-10 shrink-0 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85"
            contentClassName="hide-scrollbar min-h-0 flex-1 overflow-y-auto"
          >
            {events.length ? (
              <div className="divide-y rounded-md border">
                {events.map((event) => (
                  <div key={event.id} className="flex items-center justify-between gap-4 p-3 text-sm">
                    <span>
                      <span className="font-medium">{event.event_type}</span>
                      <span className="block text-xs text-muted-foreground">
                        {`${event.from_status ?? "-"} -> ${event.to_status ?? "-"}`}
                      </span>
                    </span>
                    <span className="text-muted-foreground">{formatDate(event.created_at)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState>No events recorded.</EmptyState>
            )}
          </Section>
        </div>
        <aside className="flex flex-col gap-6 xl:min-h-0 xl:h-full xl:self-stretch">
          <PmTaskPanel
            requestId={request.id}
            order={order}
            canStartTask={Boolean(acceptedQuote)}
            quoteStatus={latestQuote?.status}
            files={files
              .filter((file) => file.confirmed_for_translation)
              .map((file) => ({ id: file.id, original_filename: file.original_filename }))}
            translators={translators}
          />
          <PmDeliveryPanel requestId={request.id} order={order} />
          <QuotePanel
            quote={latestQuote}
            requestId={request.id}
            requestStatus={request.pm_status}
          />
        </aside>
      </div>
    </div>
  );
}

function QuotePanel({
  quote,
  requestId,
  requestStatus,
}: {
  quote?: Quote | null;
  requestId: string;
  requestStatus?: string | null;
}) {
  return (
    <Section
      title="Quote panel"
      cardClassName="flex min-h-0 flex-col overflow-hidden xl:flex-1"
      headerClassName="sticky top-0 z-10 flex flex-row items-center justify-between gap-3 space-y-0 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85"
      contentClassName="hide-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto"
    >
      {quote ? (
        <div className="space-y-4">
          <div>
            <p className="text-3xl font-semibold">
              {formatCurrency(quote.total_amount, quote.currency ?? "USD")}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <StatusBadge status={quote.status} />
              <span>v{quote.version_no}</span>
              <span>Delivery {formatDate(quote.estimated_delivery_at)}</span>
            </div>
          </div>
          <div className="space-y-2">
            {(quote.quote_items ?? []).map((item) => (
              <div key={item.id} className="flex justify-between rounded-md border p-3 text-sm">
                <span>{item.label}</span>
                <span>{formatCurrency(item.amount, quote.currency ?? "USD")}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {!quote ? (
        <form
          className="mt-4 space-y-3"
          action={async (formData) => {
            "use server";
            await generatePmQuote(formData);
          }}
        >
          <input type="hidden" name="requestId" value={requestId} />
          <Field label="Amount" name="amount" type="number" min="0" step="1" />
          <Field label="Currency" name="currency" defaultValue="USD" />
          <Field label="Estimated delivery" name="estimatedDeliveryAt" type="date" />
          <Field label="Notes" name="notes" />
          <Button type="submit" className="w-full">Generate quote</Button>
        </form>
      ) : requestStatus === "responding" || requestStatus === "negotiation" ? (
        <form
          className="mt-4 space-y-3 rounded-md border p-4"
          action={async (formData) => {
            "use server";
            await startNegotiationFromPm(formData);
          }}
        >
          <input type="hidden" name="requestId" value={requestId} />
          <input type="hidden" name="quoteId" value={quote.id} />
          <Field label="Target amount" name="expectedAmount" type="number" min="0" step="1" />
          <Field label="Target delivery" name="expectedDeliveryAt" type="date" />
          <Field label="Negotiation notes" name="adjustmentNotes" />
          <Button type="submit" variant="outline" className="w-full">
            Start negotiation
          </Button>
        </form>
      ) : null}
    </Section>
  );
}

function NegotiationCard({
  currentUserId,
  requestId,
  negotiation,
  currency,
  sourceQuote,
}: {
  currentUserId: string | null;
  requestId: string;
  negotiation: Negotiation;
  currency: string;
  sourceQuote?: Quote | null;
}) {
  const isPending = negotiation.status === "open" && negotiation.pm_decision === "pending";
  const isPmInitiated = Boolean(currentUserId && negotiation.initiated_by === currentUserId);
  const baseAmount = sourceQuote?.total_amount ?? null;
  const baseDelivery = sourceQuote?.estimated_delivery_at ?? null;

  return (
    <div className="rounded-md border p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={negotiation.status} />
            <StatusBadge status={negotiation.pm_decision} />
            <StatusBadge status={isPmInitiated ? "pm_initiated" : "requester_initiated"} />
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <ComparisonMetric
              label="Current quote"
              value={formatCurrency(baseAmount, currency)}
              secondary={`Delivery ${formatDate(baseDelivery)}`}
            />
            <ComparisonMetric
              label="Negotiation target"
              value={formatCurrency(negotiation.expected_amount, currency)}
              secondary={`Delivery ${formatDate(negotiation.expected_delivery_at)}`}
            />
          </div>
          <p className="mt-2 text-sm">{negotiation.adjustment_notes ?? "-"}</p>
        </div>
        <p className="text-sm text-muted-foreground">{formatDate(negotiation.created_at)}</p>
      </div>
      {(negotiation.quote_negotiation_messages ?? []).length ? (
        <div className="mt-4 space-y-2">
          {(negotiation.quote_negotiation_messages ?? []).map((message) => (
            <p key={message.id} className="rounded-md bg-muted/30 px-3 py-2 text-sm">
              {message.body ?? "-"}
            </p>
          ))}
        </div>
      ) : null}
      {isPending && !isPmInitiated ? (
        <form
          className="mt-4 grid gap-3 md:grid-cols-2"
          action={async (formData) => {
            "use server";
            await respondToNegotiation(formData);
          }}
        >
          <input type="hidden" name="requestId" value={requestId} />
          <input type="hidden" name="negotiationId" value={negotiation.id} />
          <Field label="Response amount" name="amount" type="number" min="0" step="1" />
          <Field label="Currency" name="currency" defaultValue={currency} />
          <Field label="Delivery" name="estimatedDeliveryAt" type="date" />
          <Field label="Message" name="message" />
          <div className="flex flex-wrap gap-2 md:col-span-2">
            <Button type="submit" name="decision" value="accept">Accept terms</Button>
            <Button type="submit" name="decision" value="counter" variant="outline">Send counter</Button>
          </div>
        </form>
      ) : isPending ? (
        <p className="mt-4 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
          Waiting for requester response on this negotiation round.
        </p>
      ) : null}
    </div>
  );
}

function Section({
  title,
  action,
  cardClassName,
  contentClassName,
  headerClassName,
  children,
}: {
  title: string;
  action?: ReactNode;
  cardClassName?: string;
  contentClassName?: string;
  headerClassName?: string;
  children: ReactNode;
}) {
  return (
    <Card className={cardClassName}>
      <CardHeader className={headerClassName ?? "flex flex-row items-center justify-between gap-3 space-y-0"}>
        <CardTitle>{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent className={contentClassName}>{children}</CardContent>
    </Card>
  );
}

function InfoGrid({ items }: { items: Array<{ label: string; value: ReactNode }> }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {items.map((item) => (
        <div key={item.label}>
          <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
            {item.label}
          </p>
          <div className="mt-2 text-sm leading-6">{item.value || "-"}</div>
        </div>
      ))}
    </div>
  );
}

function FileRow({ file }: { file: RequestFile }) {
  const result = firstRelation(file.file_parse_results);

  return (
    <div className="rounded-md border p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{file.original_filename}</p>
            <StatusBadge status={file.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {file.file_role ?? "Patent file"} · {(file.language ?? "unknown").toUpperCase()} · {file.source}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-sm">
          <Metric label="Words" value={result?.word_count ?? "-"} />
          <Metric label="Pages" value={result?.page_count ?? "-"} />
          <Metric label="Claims" value={result?.claim_count ?? "-"} />
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="min-w-20 rounded-md bg-muted/30 px-3 py-2 text-center">
      <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium">{typeof value === "number" ? value.toLocaleString() : value}</p>
    </div>
  );
}

function ComparisonMetric({
  label,
  secondary,
  value,
}: {
  label: string;
  secondary: string;
  value: string;
}) {
  return (
    <div className="rounded-md border bg-muted/20 px-3 py-3 text-sm">
      <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 font-medium">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{secondary}</p>
    </div>
  );
}

function Field({
  label,
  name,
  type = "text",
  defaultValue,
  min,
  step,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  min?: string;
  step?: string;
}) {
  return (
    <label className="block space-y-2 text-sm">
      <span className="font-medium">{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        min={min}
        step={step}
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
      />
    </label>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-md border border-dashed px-4 py-6 text-sm text-muted-foreground">
      {children}
    </p>
  );
}

function firstRelation<T>(value?: T | T[] | null) {
  if (!value) {
    return null;
  }

  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function latestBy<T extends Record<string, unknown>>(items: T[], key: keyof T) {
  return [...items].sort((left, right) => Number(right[key] ?? 0) - Number(left[key] ?? 0))[0] ?? null;
}

function labelFor(options: Array<{ value: string; label: string }>, value?: string | null) {
  if (!value) {
    return "-";
  }

  return options.find((option) => option.value === value)?.label ?? value;
}
