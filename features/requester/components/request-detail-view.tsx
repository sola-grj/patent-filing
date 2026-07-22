import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { mapPatentLookupResponse } from "@/features/requester/actions/patent-lookup";
import { PatentFileDownloadButton } from "@/features/requester/components/patent-file-download-button";
import { PatentDetailStep } from "@/features/requester/components/patent-detail-step";
import { RequesterHeader } from "@/features/requester/components/requester-header";
import {
  formatCurrency,
  formatDate,
} from "@/features/requester/format";
import {
  channelOptions,
  entityTypeOptions,
} from "@/features/requester/options";
import { RequesterStatusBadge } from "@/features/requester/requester-status";
import type { WizardPatentCandidate } from "@/features/requester/wizard-types";

type RequestFile = {
  id: string;
};

type TranslationRequirement = {
  id: string;
  source_language?: string | null;
  target_language?: string | null;
  target_languages?: string[] | null;
  scope_type?: string | null;
  scope_details?: { customScope?: string } | null;
  purpose?: string | null;
  service_types?: string[] | null;
  entity_type?: string | null;
  entity_type_code?: string | null;
  quality_level?: string | null;
  delivery_option?: string | null;
  due_at?: string | null;
  is_urgent?: boolean | null;
  config_snapshot?: {
    customScope?: string;
    sourceLanguage?: string;
    targetLanguage?: string;
    targetLanguages?: string[];
    scopeType?: string;
    purpose?: string;
    serviceTypes?: string[];
    entityType?: string;
    qualityLevel?: string;
    deliveryOption?: string;
    dueAt?: string;
    isUrgent?: boolean;
  } | null;
};

type RequestPatent = {
  patent_number: string;
  title?: string | null;
  abstract?: string | null;
  jurisdiction?: string | null;
  source?: string | null;
  application_no?: string | null;
  publication_no?: string | null;
  applicants?: string[] | null;
  inventors?: string[] | null;
  filing_date?: string | null;
  publication_date?: string | null;
  language?: string | null;
  first_priority_date?: string | null;
  international_filing_date?: string | null;
  filing_deadline_30_months?: string | null;
  filing_deadline_31_months?: string | null;
  total_pages?: number | null;
  legal_status?: string | null;
  ipc_codes?: string[] | null;
  cpc_codes?: string[] | null;
  abstract_word_count?: number | null;
  description_word_count?: number | null;
  claims_word_count?: number | null;
  claims_count?: number | null;
  drawing_count?: number | null;
  source_snapshot?: Record<string, unknown> | null;
};

type RequestConfigVersion = {
  id: string;
  version_no: number;
  config_snapshot?: TranslationRequirement["config_snapshot"];
};

type Quote = {
  id: string;
  version_no: number;
  total_amount?: number | string | null;
  currency?: string | null;
};

type QuoteNegotiationMessage = {
  author_id?: string | null;
  expected_amount?: number | string | null;
  expected_delivery_at?: string | null;
  created_at: string;
};

type QuoteNegotiation = {
  initiated_by?: string | null;
  expected_amount?: number | string | null;
  expected_delivery_at?: string | null;
  created_at: string;
  quote_negotiation_messages?: QuoteNegotiationMessage[] | null;
};

type Order = {
  id: string;
  assignment_contacts?: {
    pm_names?: string | null;
    linguist_names?: string | null;
  } | null;
  translation_tasks?: Array<{
    id: string;
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

type RequestDetail = {
  id: string;
  request_no: string;
  requester_id?: string | null;
  channel_code?: string | null;
  title?: string | null;
  workflow_stage?: string | null;
  requester_status?: string | null;
  submitted_at?: string | null;
  request_files?: RequestFile[] | null;
  request_patents?: RequestPatent | RequestPatent[] | null;
  translation_requirements?: TranslationRequirement | TranslationRequirement[] | null;
  request_config_versions?: RequestConfigVersion[] | null;
  quotes?: Quote[] | null;
  quote_negotiations?: QuoteNegotiation[] | null;
  orders?: Order | Order[] | null;
};

export function RequestDetailView({ request }: { request: RequestDetail }) {
  const files = request.request_files ?? [];
  const patent = firstRelation(request.request_patents);
  const requirement = firstRelation(request.translation_requirements);
  const configVersion = [...(request.request_config_versions ?? [])].sort(
    (left, right) => right.version_no - left.version_no,
  )[0];
  const config = requirement?.config_snapshot ?? configVersion?.config_snapshot ?? null;
  const latestQuote = [...(request.quotes ?? [])].sort(
    (left, right) => right.version_no - left.version_no,
  )[0];
  const latestNegotiation = [...(request.quote_negotiations ?? [])].sort(
    (left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
  )[0] ?? null;
  const order = firstRelation(request.orders);
  const latestDeliverable =
    ((((order?.translation_tasks ?? []) as NonNullable<Order["translation_tasks"]>) ?? [])
      .flatMap((task) => task.task_deliverables ?? [])
      .filter((deliverable) => deliverable.status && deliverable.status !== "draft")
      .sort((left, right) =>
        new Date(right.created_at ?? 0).getTime() - new Date(left.created_at ?? 0).getTime(),
      )[0] ?? null);
  const latestQuoteAmount =
    request.requester_status === "negotiation"
      ? getLatestNegotiationAmount(latestNegotiation) ?? latestQuote?.total_amount
      : latestQuote?.total_amount;
  const latestQuoteValue = latestQuoteAmount != null
    ? formatCurrency(latestQuoteAmount, latestQuote?.currency ?? "USD")
    : null;
  const assignmentContacts = order?.assignment_contacts ?? null;
  const showAssignees =
    Boolean(order?.id) &&
    (request.requester_status === "in_progress" || request.requester_status === "completed");
  const patentNumber = patent?.patent_number ?? null;
  const patentCandidate = patent ? toPatentCandidate(patent) : null;
  const entityType = requirement?.entity_type_code
    ?? requirement?.entity_type
    ?? config?.entityType;
  const entityLabel = entityType
    ? formatConfigLabel(entityTypeOptions, entityType)
    : null;
  const requestItems: DetailItem[] = [
    { label: "Request no.", value: request.request_no },
    {
      label: "Requester status",
      value: <RequesterStatusBadge status={request.requester_status} />,
    },
    { label: "Submitted time", value: formatDate(request.submitted_at) },
    ...(latestQuote
      ? [{ label: "Latest quote", value: latestQuoteValue ?? "-" }]
      : []),
    {
      label: "Channel",
      value: formatConfigLabel(channelOptions, request.channel_code),
    },
    {
      label: "Delivery date",
      value: formatDate(requirement?.due_at ?? config?.dueAt),
    },
    {
      label: "Files",
      value: `${files.length} file${files.length === 1 ? "" : "s"}`,
    },
    ...(showAssignees
      ? [
          {
            label: "Responsible PM",
            value: assignmentContacts?.pm_names?.trim() || "-",
          },
          {
            label: "Linguist",
            value: assignmentContacts?.linguist_names?.trim() || "-",
          },
        ]
      : []),
    {
      label: "Urgent",
      value: (requirement?.is_urgent ?? config?.isUrgent) ? "Yes" : "No",
    },
  ];
  return (
    <div className="flex h-full min-h-0 flex-col gap-6 overflow-hidden">
      <RequesterHeader
        title={patentNumber ?? request.request_no}
        description={`Request ${request.request_no}`}
        action={
          request.requester_status === "completed" && order?.id && latestDeliverable?.id ? (
            <Button asChild variant="secondary" size="sm">
              <a href={`/requester/orders/${order.id}/deliverables/${latestDeliverable.id}`}>
                Download ZIP
              </a>
            </Button>
          ) : null
        }
      />
      <div className="grid min-h-0 flex-1 gap-6 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
        <Section
          title="Request Information"
          cardClassName="flex h-full min-h-0 flex-col overflow-hidden"
          contentClassName="hide-scrollbar min-h-0 flex-1 overflow-y-auto"
          action={
            <div className="flex flex-wrap items-center justify-end gap-2">
              {latestQuote ? (
                <Button asChild size="sm">
                  <Link href={`/requester/requests/${request.id}/quote`}>
                    Open quote
                  </Link>
                </Button>
              ) : null}
              {order ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={`/requester/orders/${order.id}`}>Open order</Link>
                </Button>
              ) : null}
            </div>
          }
        >
          <DetailsGrid items={requestItems} columns="single" />
        </Section>
        <Section
          title="Patent Information"
          cardClassName="flex h-full min-h-0 flex-col overflow-hidden"
          contentClassName="hide-scrollbar min-h-0 flex-1 overflow-y-auto"
          action={
            configVersion || patentNumber ? (
              <div className="flex items-center gap-2">
                {configVersion ? (
                  <span className="text-xs text-muted-foreground">
                    Config v{configVersion.version_no}
                  </span>
                ) : null}
                {patentNumber ? (
                  <PatentFileDownloadButton requestId={request.id} />
                ) : null}
              </div>
            ) : null
          }
        >
          {patentCandidate ? (
            <PatentDetailStep
              patent={patentCandidate}
              additionalMetadata={entityLabel
                ? [{ label: "Entity", value: entityLabel }]
                : []}
            />
          ) : (
            <p className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
              No patent information is associated with this request.
            </p>
          )}
        </Section>
      </div>
    </div>
  );
}

function firstRelation<T>(value?: T | T[] | null) {
  if (!value) {
    return null;
  }

  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function toPatentCandidate(patent: RequestPatent): WizardPatentCandidate {
  const snapshotCandidate = mapPatentLookupResponse(
    patent.source_snapshot ?? {},
    patent.patent_number,
  );
  const ipcCodes = patent.ipc_codes?.length
    ? patent.ipc_codes
    : snapshotCandidate.ipcCodes;
  const cpcCodes = patent.cpc_codes?.length
    ? patent.cpc_codes
    : snapshotCandidate.cpcCodes;

  return {
    ...snapshotCandidate,
    id: patent.patent_number,
    patentNumber: patent.patent_number,
    title: patent.title || snapshotCandidate.title,
    jurisdiction: patent.jurisdiction || snapshotCandidate.jurisdiction,
    applicationNo: patent.application_no || snapshotCandidate.applicationNo,
    publicationNo: patent.publication_no || snapshotCandidate.publicationNo,
    applicants: patent.applicants?.length
      ? patent.applicants
      : snapshotCandidate.applicants,
    inventors: patent.inventors?.length
      ? patent.inventors
      : snapshotCandidate.inventors,
    description: patent.abstract || snapshotCandidate.description,
    filingDate: patent.filing_date || snapshotCandidate.filingDate,
    publicationDate: patent.publication_date || snapshotCandidate.publicationDate,
    language: patent.language || snapshotCandidate.language,
    firstPriorityDate: patent.first_priority_date || snapshotCandidate.firstPriorityDate,
    internationalFilingDate:
      patent.international_filing_date || snapshotCandidate.internationalFilingDate,
    filingDeadline30Months:
      patent.filing_deadline_30_months || snapshotCandidate.filingDeadline30Months,
    filingDeadline31Months:
      patent.filing_deadline_31_months || snapshotCandidate.filingDeadline31Months,
    totalPages: patent.total_pages || snapshotCandidate.totalPages,
    legalStatus: patent.legal_status || snapshotCandidate.legalStatus,
    technicalField: ipcCodes?.[0] || cpcCodes?.[0] || snapshotCandidate.technicalField,
    ipcCodes,
    cpcCodes,
    abstractWordCount:
      patent.abstract_word_count || snapshotCandidate.abstractWordCount,
    descriptionWordCount:
      patent.description_word_count || snapshotCandidate.descriptionWordCount,
    claimsWordCount: patent.claims_word_count || snapshotCandidate.claimsWordCount,
    claimsCount: patent.claims_count || snapshotCandidate.claimsCount,
    drawingCount: patent.drawing_count || snapshotCandidate.drawingCount,
    source: patent.source || snapshotCandidate.source,
    sourceSnapshot: patent.source_snapshot ?? snapshotCandidate.sourceSnapshot,
  };
}

function formatConfigLabel(
  options: Array<{ value: string; label: string }>,
  value?: string | null,
) {
  if (!value) {
    return "-";
  }

  return options.find((option) => option.value === value)?.label ?? value;
}

function getLatestNegotiationAmount(
  negotiation: QuoteNegotiation | null,
) {
  if (!negotiation) {
    return null;
  }

  const latestMessageWithQuote = [...(negotiation.quote_negotiation_messages ?? [])]
    .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
    .find((message) => message.expected_amount != null || message.expected_delivery_at);

  if (latestMessageWithQuote) {
    return latestMessageWithQuote.expected_amount ?? null;
  }

  if (negotiation.expected_amount != null) {
    return negotiation.expected_amount;
  }

  return null;
}

function Section({
  title,
  action,
  cardClassName,
  contentClassName,
  children,
}: {
  title: string;
  action?: ReactNode;
  cardClassName?: string;
  contentClassName?: string;
  children: ReactNode;
}) {
  return (
    <Card className={cardClassName ?? "h-full"}>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <CardTitle>{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent className={contentClassName ?? "space-y-6"}>
        {children}
      </CardContent>
    </Card>
  );
}

type DetailItem = {
  label: string;
  value: ReactNode;
  className?: string;
};

function DetailsGrid({
  items,
  columns = "double",
}: {
  items: DetailItem[];
  columns?: "single" | "double";
}) {
  const gridClassName = columns === "single"
    ? "grid gap-4"
    : "grid gap-5 md:grid-cols-2";

  return (
    <div className={gridClassName}>
      {items.map((item) => (
        <div key={item.label} className={item.className}>
          <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
            {item.label}
          </p>
          <div className="mt-2 text-sm leading-6">{item.value || "-"}</div>
        </div>
      ))}
    </div>
  );
}
