import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  generatePmQuote,
  respondToNegotiation,
  startNegotiationFromPm,
} from "@/features/pm/actions";
import { QuoteNegotiationHistory } from "@/features/requester/components/quote-negotiation-history";
import {
  StatusBadge,
  formatCurrency,
  formatDate,
} from "@/features/requester/format";
import {
  purposeOptions,
  qualityOptions,
  scopeOptions,
  sourceLanguageOptions,
  targetLanguageOptions,
} from "@/features/requester/options";
import type { RequesterQuoteHistoryEntry } from "@/features/requester/queries";
import { RequesterStatusBadge } from "@/features/requester/requester-status";

import { PmCloseRequestDialog } from "./pm-close-request-dialog";
import { PmDeliveryPanel } from "./pm-delivery-panel";
import { PmHeader } from "./pm-header";
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

type NegotiationMessage = {
  id: string;
  author_id?: string | null;
  body?: string | null;
  expected_amount?: number | string | null;
  expected_delivery_at?: string | null;
  adjustment_notes?: string | null;
  created_at: string;
};

type Negotiation = {
  id: string;
  initiated_by?: string | null;
  quote_id?: string | null;
  expected_amount?: number | string | null;
  expected_delivery_at?: string | null;
  adjustment_notes?: string | null;
  reject_reason?: string | null;
  pm_decision?: string | null;
  status?: string | null;
  response_quote_id?: string | null;
  created_at: string;
  updated_at?: string | null;
  quote_negotiation_messages?: NegotiationMessage[] | null;
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

type NegotiationPoint = {
  amount: number | string | null;
  deliveryAt: string | null;
  source: "pm" | "requester" | "quote";
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
    new Date(left.created_at).getTime() - new Date(right.created_at).getTime(),
  );
  const latestOpenNegotiation =
    [...negotiations].reverse().find((negotiation) => negotiation.status === "open") ?? null;
  const negotiationHistory = negotiations.map((negotiation, index) =>
    mapPmNegotiationHistoryEntry(
      negotiation,
      index === negotiations.length - 1,
      currentUserId,
    ),
  );
  const latestNegotiationHistory =
    negotiationHistory[negotiationHistory.length - 1] ?? null;
  const activeSourceQuote =
    latestOpenNegotiation?.quote_id
      ? quoteById.get(latestOpenNegotiation.quote_id) ?? null
      : latestQuote;
  const events = [...(request.request_events ?? [])].sort((left, right) =>
    new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-8 overflow-hidden">
      <div className="shrink-0">
        <PmHeader
          title={request.title ?? request.request_no}
          description={`${request.request_no} · ${organization?.name ?? "Customer organization"}`}
          action={<PmCloseRequestDialog requestId={request.id} />}
        />
      </div>
      <div className="hide-scrollbar min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.28fr)_minmax(320px,0.72fr)] xl:items-start">
          <div className="flex flex-col gap-6 xl:pr-2">
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
              cardClassName="flex min-h-0 max-h-[32rem] flex-col overflow-hidden"
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
                  { label: "Due date", value: formatDate(requirement?.due_at) },
                  { label: "Notes", value: requirement?.scope_details?.customScope ?? "-" },
                  { label: "Urgent", value: requirement?.is_urgent ? "Yes" : "No" },
                ]}
              />
            </Section>
            {negotiationHistory.length ? (
              <QuoteNegotiationHistory
                cardClassName="flex min-h-0 max-h-[30rem] flex-col overflow-hidden"
                contentClassName="hide-scrollbar min-h-0 flex-1 overflow-y-auto"
                currency={latestQuote?.currency ?? "USD"}
                headerClassName="sticky top-0 z-10 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85"
                items={negotiationHistory}
              />
            ) : (
              <Section
                title="Negotiation history"
                cardClassName="flex min-h-0 max-h-[30rem] flex-col overflow-hidden"
                headerClassName="sticky top-0 z-10 shrink-0 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85"
              >
                <EmptyState>No negotiation rounds yet.</EmptyState>
              </Section>
            )}
            <Section
              title="Event timeline"
              cardClassName="flex min-h-0 max-h-[24rem] flex-col overflow-hidden"
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
          <aside className="flex flex-col gap-6 xl:pr-2">
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
              sourceQuote={activeSourceQuote}
              latestNegotiation={latestOpenNegotiation}
              latestNegotiationHistory={latestNegotiationHistory}
              negotiationHistory={negotiationHistory}
              currentUserId={currentUserId}
              requestId={request.id}
              requestStatus={request.pm_status}
            />
          </aside>
        </div>
      </div>
    </div>
  );
}

function QuotePanel({
  quote,
  sourceQuote,
  latestNegotiation,
  latestNegotiationHistory,
  negotiationHistory,
  currentUserId,
  requestId,
  requestStatus,
}: {
  quote?: Quote | null;
  sourceQuote?: Quote | null;
  latestNegotiation?: Negotiation | null;
  latestNegotiationHistory?: RequesterQuoteHistoryEntry | null;
  negotiationHistory: RequesterQuoteHistoryEntry[];
  currentUserId: string | null;
  requestId: string;
  requestStatus?: string | null;
}) {
  const isActiveNegotiation = latestNegotiation?.status === "open";
  const isWaitingForRequesterFeedback = Boolean(
    isActiveNegotiation &&
      latestNegotiation?.initiated_by &&
      currentUserId &&
      latestNegotiation.initiated_by === currentUserId,
  );
  const primaryPoint = isActiveNegotiation
    ? getLatestNegotiationPoint(latestNegotiationHistory ?? null, quote ?? null)
    : null;
  const previousPmPoint = isActiveNegotiation
    ? getPreviousPmQuotePoint(negotiationHistory, primaryPoint)
    : null;
  const primaryAmount =
    primaryPoint?.amount != null ? primaryPoint.amount : quote?.total_amount;
  const primaryDeliveryAt =
    primaryPoint?.deliveryAt ? primaryPoint.deliveryAt : quote?.estimated_delivery_at;
  const comparisonAmount =
    previousPmPoint?.amount ?? sourceQuote?.total_amount ?? null;
  const comparisonDeliveryAt =
    previousPmPoint?.deliveryAt ?? sourceQuote?.estimated_delivery_at ?? null;
  const showNegotiatedComparison = Boolean(
    isActiveNegotiation && primaryPoint && (previousPmPoint || sourceQuote),
  );
  const reQuoteFormId = `pm-requote-${requestId}`;

  return (
    <Section
      title="Quote panel"
      cardClassName="flex flex-col overflow-visible"
      headerClassName="sticky top-0 z-10 flex flex-row items-center justify-between gap-3 space-y-0 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85"
      contentClassName="space-y-4"
    >
      {quote ? (
        <div className="space-y-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="space-y-2">
              {showNegotiatedComparison ? (
                <p className="whitespace-nowrap text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  Negotiated quote
                </p>
              ) : null}
              <p className="text-3xl font-semibold">
                {formatCurrency(primaryAmount, quote.currency ?? "USD")}
              </p>
            </div>
            {showNegotiatedComparison ? (
              <div className="min-w-[180px] rounded-xl border bg-muted/20 px-4 py-3 md:text-right">
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  Previous quote
                </p>
                <p className="mt-2 text-2xl font-semibold text-muted-foreground">
                  {formatCurrency(comparisonAmount, quote.currency ?? "USD")}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Delivery {formatDate(comparisonDeliveryAt)}
                </p>
              </div>
            ) : null}
          </div>
          <div className="grid gap-3 text-sm md:grid-cols-3 md:items-start">
            <div className="space-y-1 md:justify-self-start">
              <p className="text-sm font-semibold text-foreground">Status</p>
              <div className="text-sm leading-6">
                <RequesterStatusBadge size="compact" status={requestStatus} />
              </div>
            </div>
            <div className="space-y-1 md:justify-self-center">
              <p className="text-sm font-semibold text-foreground">Delivery</p>
              <div className="text-sm leading-6">{formatDate(primaryDeliveryAt)}</div>
            </div>
            <div className="space-y-1 md:justify-self-end">
              <p className="text-sm font-semibold text-foreground">Valid until</p>
              <div className="text-sm leading-6">{formatDate(quote.valid_until)}</div>
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
      ) : requestStatus === "negotiation" && latestNegotiation ? (
        <div className="space-y-3 rounded-md border p-4">
          {isWaitingForRequesterFeedback ? (
            <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              Waiting for requester feedback on the latest negotiation round.
            </p>
          ) : (
            <>
              <form
                id={reQuoteFormId}
                className="space-y-3"
                action={async (formData) => {
                  "use server";
                  await respondToNegotiation(formData);
                }}
              >
                <input type="hidden" name="requestId" value={requestId} />
                <input type="hidden" name="negotiationId" value={latestNegotiation.id} />
                <input type="hidden" name="currency" value={quote.currency ?? "USD"} />
                <Field
                  label="Target amount"
                  name="amount"
                  type="number"
                  min="0"
                  step="1"
                  defaultValue={latestNegotiation.expected_amount ? String(latestNegotiation.expected_amount) : undefined}
                />
                <Field
                  label="Target delivery"
                  name="estimatedDeliveryAt"
                  type="date"
                />
                <Field
                  label="Negotiation notes"
                  name="message"
                />
              </form>
              <div className="flex flex-wrap gap-2">
                <form
                  action={async (formData) => {
                    "use server";
                    await respondToNegotiation(formData);
                  }}
                >
                  <input type="hidden" name="requestId" value={requestId} />
                  <input type="hidden" name="negotiationId" value={latestNegotiation.id} />
                  <Button type="submit" name="decision" value="accept">Accept</Button>
                </form>
                <Button form={reQuoteFormId} type="submit" name="decision" value="counter" variant="outline">
                  Re-quote
                </Button>
              </div>
            </>
          )}
        </div>
      ) : requestStatus === "responding" ? (
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

function mapPmNegotiationHistoryEntry(
  negotiation: Negotiation,
  isLatest: boolean,
  currentUserId?: string | null,
): RequesterQuoteHistoryEntry {
  const messages = [...(negotiation.quote_negotiation_messages ?? [])]
    .sort((left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime())
    .map((message) => ({
      id: message.id,
      authorId: message.author_id ?? null,
      authorLabel:
        message.author_id && currentUserId && message.author_id === currentUserId
          ? "PM feedback"
          : "Requester",
      body: message.body?.trim() || "No message provided.",
      expectedAmount: message.expected_amount ?? null,
      expectedDeliveryAt: message.expected_delivery_at ?? null,
      adjustmentNotes: message.adjustment_notes ?? null,
      createdAt: message.created_at,
    }));

  return {
    id: negotiation.id,
    quoteId: negotiation.quote_id ?? null,
    initiatedBy: negotiation.initiated_by ?? null,
    expectedAmount: negotiation.expected_amount ?? null,
    expectedDeliveryAt: negotiation.expected_delivery_at ?? null,
    adjustmentNotes: negotiation.adjustment_notes ?? null,
    rejectReason: negotiation.reject_reason ?? null,
    pmDecision: negotiation.pm_decision ?? null,
    status: negotiation.status ?? null,
    responseQuoteId: negotiation.response_quote_id ?? null,
    createdAt: negotiation.created_at,
    updatedAt: negotiation.updated_at ?? null,
    isLatest,
    messages,
  };
}

function getLatestNegotiationPoint(
  latestNegotiation: RequesterQuoteHistoryEntry | null,
  quote: Quote | null,
): NegotiationPoint | null {
  if (!latestNegotiation) {
    return null;
  }

  const latestMessageWithQuote = [...latestNegotiation.messages]
    .reverse()
    .find((message) => message.expectedAmount != null || message.expectedDeliveryAt);

  if (latestMessageWithQuote) {
    return {
      amount: latestMessageWithQuote.expectedAmount ?? null,
      deliveryAt: latestMessageWithQuote.expectedDeliveryAt ?? null,
      source: latestMessageWithQuote.authorLabel === "Requester" ? "requester" : "pm",
    };
  }

  if (latestNegotiation.expectedAmount != null || latestNegotiation.expectedDeliveryAt) {
    return {
      amount: latestNegotiation.expectedAmount ?? null,
      deliveryAt: latestNegotiation.expectedDeliveryAt ?? null,
      source: "requester",
    };
  }

  if (!quote) {
    return null;
  }

  return {
    amount: quote.total_amount ?? null,
    deliveryAt: quote.estimated_delivery_at ?? null,
    source: "quote",
  };
}

function getPreviousPmQuotePoint(
  history: RequesterQuoteHistoryEntry[],
  primaryPoint: NegotiationPoint | null,
): NegotiationPoint | null {
  const pmMessages = history
    .flatMap((entry) => entry.messages)
    .filter((message) => message.authorLabel === "PM feedback")
    .filter((message) => message.expectedAmount != null || message.expectedDeliveryAt);

  if (!pmMessages.length) {
    return null;
  }

  const currentPmSignature =
    primaryPoint?.source === "pm"
      ? `${String(primaryPoint.amount ?? "")}|${primaryPoint.deliveryAt ?? ""}`
      : null;

  const previousPmMessage = [...pmMessages]
    .reverse()
    .find((message) => {
      if (!currentPmSignature) {
        return true;
      }

      return `${String(message.expectedAmount ?? "")}|${message.expectedDeliveryAt ?? ""}` !== currentPmSignature;
    });

  if (!previousPmMessage) {
    return null;
  }

  return {
    amount: previousPmMessage.expectedAmount ?? null,
    deliveryAt: previousPmMessage.expectedDeliveryAt ?? null,
    source: "pm",
  };
}
