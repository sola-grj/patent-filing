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
  formatCurrency,
  formatDate,
} from "@/features/requester/format";
import {
  formatRequestEventTitle,
  formatRequestEventTransition,
} from "@/features/pm/request-event-copy";
import type { RequesterQuoteHistoryEntry } from "@/features/requester/queries";
import { PatentFileDownloadButton } from "@/features/requester/components/patent-file-download-button";
import {
  RequestFileInformation,
  type RequestInformationFile,
} from "@/features/requester/components/request-file-information";
import { RequestFilesDownloadButton } from "@/features/requester/components/request-files-download-button";
import { RequesterStatusBadge } from "@/features/requester/requester-status";
import type {
  WizardConfig,
  WizardPatentCandidate,
} from "@/features/requester/wizard-types";

import { ClickableDateInput } from "./clickable-date-input";
import { PmFormSubmitButton } from "./pm-form-submit-button";
import { PmHeader } from "./pm-header";
import { PmPatentInfo, type PmRequestPatent } from "./pm-patent-info";
import { PmQuoteSheet } from "./pm-quote-sheet";
import { PmRequestHeaderAction } from "./pm-request-header-action";
import { PmRequestOverview } from "./pm-request-overview";

const SHOW_QUOTE_PANEL = false;
const SHOW_NEGOTIATION_HISTORY = false;

type Quote = {
  id: string;
  version_no: number;
  status?: string | null;
  total_amount?: number | string | null;
  currency?: string | null;
  estimated_delivery_at?: string | null;
  valid_until?: string | null;
  pricing_snapshot?: { wordCount?: number | null } | null;
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
  target_languages?: string[] | null;
  scope_type?: string | null;
  purpose?: string | null;
  service_types?: string[] | null;
  entity_type?: string | null;
  quality_level?: string | null;
  delivery_option?: string | null;
  due_at?: string | null;
  is_urgent?: boolean | null;
  scope_details?: { customScope?: string } | null;
  filing_type_code?: string | null;
  application_type_code?: string | null;
  entity_type_code?: string | null;
  epv_type_code?: string | null;
  jurisdiction_codes?: string[] | null;
  config_snapshot?: Partial<WizardConfig> | null;
};

type RequestConfigVersion = {
  version_no?: number | null;
  config_snapshot?: Partial<WizardConfig> | null;
};

type PatentSearch = {
  patent_candidates?: Array<{
    metadata?: WizardPatentCandidate | null;
  }> | null;
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
  payload?: Record<string, unknown> | null;
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
    source_mode?: string | null;
    channel_code?: string | null;
    submitted_at?: string | null;
    updated_at?: string | null;
    organizations?: { name?: string | null } | Array<{ name?: string | null }> | null;
    request_files?: RequestInformationFile[] | null;
    request_patents?: PmRequestPatent | PmRequestPatent[] | null;
    patent_searches?: PatentSearch[] | null;
    translation_requirements?: Requirement | Requirement[] | null;
    request_config_versions?: RequestConfigVersion[] | null;
    quotes?: Quote[] | null;
    quote_negotiations?: Negotiation[] | null;
    orders?: Order | Order[] | null;
    request_events?: RequestEvent[] | null;
  };
  currentUserId: string | null;
};

export function PmRequestDetail({
  request,
  currentUserId,
}: PmRequestDetailProps) {
  const organization = firstRelation(request.organizations);
  const requirement = firstRelation(request.translation_requirements);
  const latestQuote = latestBy(request.quotes ?? [], "version_no");
  const patent = firstRelation(request.request_patents);
  const patentCandidate = firstRelation(
    firstRelation(request.patent_searches)?.patent_candidates,
  )?.metadata ?? null;
  const isPatentSearch = request.source_mode === "patent_search";
  const config = resolveRequestConfig(request, requirement);
  const translationWordCount = resolveTranslationWordCount(
    config,
    latestQuote,
    patent,
    patentCandidate,
  );
  const order = firstRelation(request.orders);
  const files = request.request_files ?? [];
  const uploadedFiles = files.filter((file) => file.source === "upload");
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
  const headerTitle =
    (isPatentSearch
      ? patent?.patent_number?.trim() || patentCandidate?.patentNumber?.trim()
      : null) ||
    request.request_no;

  return (
    <div className="flex h-full min-h-0 flex-col gap-8 overflow-hidden">
      <div className="shrink-0">
        <PmHeader
          title={headerTitle}
          description={`Request ${request.request_no} · ${organization?.name ?? "Customer organization"}`}
          status={<RequesterStatusBadge status={request.pm_status} size="compact" />}
          action={
            <PmRequestHeaderAction
              requestId={request.id}
              status={request.pm_status}
              order={order}
            />
          }
        />
      </div>
      <div className="hide-scrollbar min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="flex flex-col gap-6 pr-1">
            <PmRequestOverview
              config={config}
              organizationName={organization?.name ?? "-"}
              request={request}
            />
            {isPatentSearch ? (
              <PmPatentInfo
                patent={patent}
                candidate={patentCandidate}
                action={<PatentFileDownloadButton requestId={request.id} />}
              />
            ) : (
              <RequestFileInformation
                files={uploadedFiles}
                action={
                  <RequestFilesDownloadButton
                    href={`/requester/requests/${request.id}/download`}
                  />
                }
              />
            )}
            <PmQuoteSheet
              config={config}
              translationWordCount={translationWordCount}
            />
            {SHOW_NEGOTIATION_HISTORY ? (
              negotiationHistory.length ? (
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
              )
            ) : null}
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
                        <span className="font-medium">
                          {formatRequestEventTitle(event.event_type, event.payload)}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {formatRequestEventTransition(event.from_status, event.to_status)}
                        </span>
                      </span>
                      <span className="text-muted-foreground">{formatEventDateTime(event.created_at)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState>No events recorded.</EmptyState>
              )}
            </Section>
            {SHOW_QUOTE_PANEL ? (
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
            ) : null}
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
                <div className="flex flex-wrap gap-2">
                  <PmFormSubmitButton
                    type="submit"
                    name="decision"
                    value="accept"
                    pendingLabel="Accepting..."
                    watchField="decision"
                    watchValue="accept"
                  >
                    Accept
                  </PmFormSubmitButton>
                  <PmFormSubmitButton
                    type="submit"
                    name="decision"
                    value="counter"
                    variant="outline"
                    pendingLabel="Re-quoting..."
                    watchField="decision"
                    watchValue="counter"
                  >
                    Re-quote
                  </PmFormSubmitButton>
                </div>
              </form>
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
      {type === "date" ? (
        <ClickableDateInput
          name={name}
          defaultValue={defaultValue}
          min={min}
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        />
      ) : (
        <input
          name={name}
          type={type}
          defaultValue={defaultValue}
          min={min}
          step={step}
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        />
      )}
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

function resolveRequestConfig(
  request: PmRequestDetailProps["request"],
  requirement?: Requirement | null,
): WizardConfig {
  const latestConfig = [...(request.request_config_versions ?? [])]
    .sort((left, right) => Number(right.version_no ?? 0) - Number(left.version_no ?? 0))[0]
    ?.config_snapshot;
  const snapshot = latestConfig ?? requirement?.config_snapshot ?? {};

  return {
    channelCode: snapshot.channelCode ?? request.channel_code ?? "",
    sourceLanguage: snapshot.sourceLanguage ?? requirement?.source_language ?? "",
    jurisdictionCodes:
      snapshot.jurisdictionCodes ?? requirement?.jurisdiction_codes ?? [],
    scopeType: snapshot.scopeType ?? requirement?.scope_type ?? "",
    purpose: snapshot.purpose ?? requirement?.purpose ?? "",
    serviceTypes: snapshot.serviceTypes ?? requirement?.service_types ?? [],
    filingType: snapshot.filingType ?? requirement?.filing_type_code ?? undefined,
    filingApplicationType:
      snapshot.filingApplicationType ?? requirement?.application_type_code ?? undefined,
    entityType:
      snapshot.entityType ??
      requirement?.entity_type_code ??
      requirement?.entity_type ??
      undefined,
    epvType: snapshot.epvType ?? requirement?.epv_type_code ?? undefined,
    qualityLevel: snapshot.qualityLevel ?? requirement?.quality_level ?? "",
    deliveryOption: snapshot.deliveryOption ?? requirement?.delivery_option ?? "",
    dueAt: snapshot.dueAt ?? requirement?.due_at ?? undefined,
    isUrgent: snapshot.isUrgent ?? requirement?.is_urgent ?? false,
    customScope:
      snapshot.customScope ?? requirement?.scope_details?.customScope ?? undefined,
  };
}

function resolveTranslationWordCount(
  config: WizardConfig,
  quote?: Quote | null,
  patent?: PmRequestPatent | null,
  patentCandidate?: WizardPatentCandidate | null,
) {
  if (config.scopeType === "no_translation") return 0;
  if (config.scopeType === "claims_only") {
    return patent?.claims_word_count ?? patentCandidate?.claimsWordCount ?? 3324;
  }

  const storedWordCount = quote?.pricing_snapshot?.wordCount
    ?? (patent
      ? Number(patent.abstract_word_count ?? 0)
        + Number(patent.description_word_count ?? 0)
        + Number(patent.claims_word_count ?? 0)
      : Number(patentCandidate?.abstractWordCount ?? 0)
        + Number(patentCandidate?.descriptionWordCount ?? 0)
        + Number(patentCandidate?.claimsWordCount ?? 0));
  return storedWordCount || 23705;
}

function formatEventDateTime(value?: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value));
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
