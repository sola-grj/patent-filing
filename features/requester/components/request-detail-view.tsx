import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { mapPatentLookupResponse } from "@/features/requester/actions/patent-lookup";
import { PatentFileDownloadButton } from "@/features/requester/components/patent-file-download-button";
import { PatentDetailStep } from "@/features/requester/components/patent-detail-step";
import {
  RequestFileInformation,
  type RequestInformationFile,
} from "@/features/requester/components/request-file-information";
import { RequestFilesDownloadButton } from "@/features/requester/components/request-files-download-button";
import { RequestQuoteSheet } from "@/features/requester/components/request-quote-sheet";
import { RequesterHeader } from "@/features/requester/components/requester-header";
import {
  formatDate,
} from "@/features/requester/format";
import {
  channelOptions,
  entityTypeOptions,
  epvTypeOptions,
  filingApplicationTypeOptions,
  filingTypeOptions,
  jurisdictionOptions,
  purposeOptions,
  qualityOptions,
  serviceTypeOptions,
  sourceLanguageOptions,
} from "@/features/requester/options";
import type {
  WizardConfig,
  WizardPatentCandidate,
} from "@/features/requester/wizard-types";

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
  filing_type_code?: string | null;
  application_type_code?: string | null;
  epv_type_code?: string | null;
  jurisdiction_codes?: string[] | null;
  quality_level?: string | null;
  delivery_option?: string | null;
  due_at?: string | null;
  is_urgent?: boolean | null;
  config_snapshot?: Partial<WizardConfig> | null;
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
  pricing_snapshot?: { wordCount?: number | null } | null;
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
  source_mode?: string | null;
  submitted_at?: string | null;
  updated_at?: string | null;
  organizations?: {
    id: string;
    name?: string | null;
  } | Array<{
    id: string;
    name?: string | null;
  }> | null;
  request_files?: RequestInformationFile[] | null;
  request_patents?: RequestPatent | RequestPatent[] | null;
  translation_requirements?: TranslationRequirement | TranslationRequirement[] | null;
  request_config_versions?: RequestConfigVersion[] | null;
  quotes?: Quote[] | null;
  quote_negotiations?: QuoteNegotiation[] | null;
  orders?: Order | Order[] | null;
};

export function RequestDetailView({ request }: { request: RequestDetail }) {
  const files = request.request_files ?? [];
  const uploadedFiles = files.filter((file) => file.source === "upload");
  const patent = firstRelation(request.request_patents);
  const requirement = firstRelation(request.translation_requirements);
  const configVersion = [...(request.request_config_versions ?? [])].sort(
    (left, right) => right.version_no - left.version_no,
  )[0];
  const config = resolveRequestConfig(
    request,
    requirement,
    configVersion?.config_snapshot ?? requirement?.config_snapshot ?? {},
  );
  const latestQuote = [...(request.quotes ?? [])].sort(
    (left, right) => right.version_no - left.version_no,
  )[0];
  const order = firstRelation(request.orders);
  const latestDeliverable =
    ((((order?.translation_tasks ?? []) as NonNullable<Order["translation_tasks"]>) ?? [])
      .flatMap((task) => task.task_deliverables ?? [])
      .filter((deliverable) => deliverable.status && deliverable.status !== "draft")
      .sort((left, right) =>
        new Date(right.created_at ?? 0).getTime() - new Date(left.created_at ?? 0).getTime(),
      )[0] ?? null);
  const isPatentSearch = request.source_mode === "patent_search";
  const patentNumber = isPatentSearch ? patent?.patent_number ?? null : null;
  const patentCandidate = isPatentSearch && patent ? toPatentCandidate(patent) : null;
  const translationWordCount = resolveTranslationWordCount(
    config,
    latestQuote,
    patent,
    uploadedFiles,
  );
  const entityType = requirement?.entity_type_code
    ?? requirement?.entity_type
    ?? config.entityType;
  const entityLabel = entityType
    ? formatConfigLabel(entityTypeOptions, entityType)
    : null;
  const organization = firstRelation(request.organizations);
  const serviceTypes = config.serviceTypes;
  const jurisdictionCodes = config.jurisdictionCodes;
  const dueAt = config.dueAt;
  const showFilingFields = serviceTypes.includes("filing");
  const showEpvType = serviceTypes.includes("epv");
  const showQuality = serviceTypes.includes("translation") || showEpvType;
  const showDueDate = serviceTypes.includes("translation") && Boolean(dueAt);
  const requestItems: DetailItem[] = [
    { label: "Organization", value: organization?.name ?? "-" },
    { label: "Submitted", value: formatDate(request.submitted_at) },
    { label: "Updated", value: formatDate(request.updated_at) },
    {
      label: "Channel",
      value: channelLabel(config.channelCode),
    },
    {
      label: "Service type",
      value: formatConfigLabels(serviceTypeOptions, serviceTypes),
    },
    {
      label: "Patent language",
      value: formatConfigLabel(
        sourceLanguageOptions,
        config.sourceLanguage,
      ),
    },
    {
      label: "Jurisdictions",
      value: formatConfigLabels(jurisdictionOptions, jurisdictionCodes),
    },
    {
      label: "Purpose",
      value: formatConfigLabel(
        purposeOptions,
        config.purpose,
      ),
    },
    ...(showQuality
      ? [{
          label: "Quality",
          value: formatConfigLabel(qualityOptions, config.qualityLevel),
        }]
      : []),
    {
      label: "Delivery option",
      value: titleCase(config.deliveryOption),
    },
    ...(showFilingFields
      ? [
          {
            label: "Filing type",
            value: formatConfigLabel(
              filingTypeOptions,
              config.filingType,
            ),
          },
          {
            label: "Application type",
            value: formatConfigLabel(
              filingApplicationTypeOptions,
              config.filingApplicationType,
            ),
          },
          {
            label: "Entity type",
            value: formatConfigLabel(entityTypeOptions, entityType),
          },
        ]
      : []),
    ...(showEpvType
      ? [{
          label: "EPV type",
          value: formatConfigLabel(
            epvTypeOptions,
            config.epvType,
          ),
        }]
      : []),
    ...(showDueDate
      ? [{ label: "Due date", value: formatDate(dueAt) }]
      : []),
    {
      label: "Urgent",
      value: config.isUrgent ? "Yes" : "No",
    },
    {
      label: "Special requirements",
      value:
        config.customScope?.trim() || "-",
      className: "md:col-span-2",
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
      <div className="hide-scrollbar min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="flex flex-col gap-6 pr-1">
          <Section title="Request overview">
            <DetailsGrid items={requestItems} />
          </Section>
          {isPatentSearch ? (
            <Section
              title="Patent Information"
              action={
                patentNumber ? (
                  <PatentFileDownloadButton requestId={request.id} />
                ) : null
              }
            >
              {patentCandidate ? (
                <PatentDetailStep
                  patent={patentCandidate}
                  flushBibliographic
                  plainBibliographic
                  useParentScroll
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
          <RequestQuoteSheet
            config={config}
            translationWordCount={translationWordCount}
          />
        </div>
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

function resolveRequestConfig(
  request: Pick<RequestDetail, "channel_code">,
  requirement?: TranslationRequirement | null,
  snapshot: Partial<WizardConfig> = {},
): WizardConfig {
  return {
    channelCode: snapshot.channelCode ?? request.channel_code ?? "",
    sourceLanguage: snapshot.sourceLanguage ?? requirement?.source_language ?? "",
    jurisdictionCodes:
      snapshot.jurisdictionCodes ?? requirement?.jurisdiction_codes ?? [],
    scopeType: snapshot.scopeType ?? requirement?.scope_type ?? "full_text",
    purpose: snapshot.purpose ?? requirement?.purpose ?? "",
    serviceTypes: snapshot.serviceTypes ?? requirement?.service_types ?? [],
    filingType: snapshot.filingType ?? requirement?.filing_type_code ?? undefined,
    filingApplicationType:
      snapshot.filingApplicationType
      ?? requirement?.application_type_code
      ?? undefined,
    entityType:
      snapshot.entityType
      ?? requirement?.entity_type_code
      ?? requirement?.entity_type
      ?? undefined,
    epvType: snapshot.epvType ?? requirement?.epv_type_code ?? undefined,
    qualityLevel: snapshot.qualityLevel ?? requirement?.quality_level ?? "",
    deliveryOption: snapshot.deliveryOption ?? requirement?.delivery_option ?? "",
    dueAt: snapshot.dueAt ?? requirement?.due_at ?? undefined,
    isUrgent: snapshot.isUrgent ?? requirement?.is_urgent ?? false,
    customScope:
      snapshot.customScope
      ?? requirement?.scope_details?.customScope
      ?? undefined,
  };
}

function resolveTranslationWordCount(
  config: WizardConfig,
  quote: Quote | null | undefined,
  patent: RequestPatent | null,
  files: RequestInformationFile[],
) {
  if (config.scopeType === "no_translation") {
    return 0;
  }

  if (config.scopeType === "claims_only") {
    return patent?.claims_word_count ?? 3324;
  }

  const patentWordCount = patent
    ? Number(patent.abstract_word_count ?? 0)
      + Number(patent.description_word_count ?? 0)
      + Number(patent.claims_word_count ?? 0)
    : 0;
  const uploadedFileWordCount = files.reduce((total, file) => {
    const parseResult = firstRelation(file.file_parse_results);
    return total + Number(parseResult?.word_count ?? 0);
  }, 0);

  return quote?.pricing_snapshot?.wordCount
    || patentWordCount
    || uploadedFileWordCount
    || 23705;
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

function formatConfigLabels(
  options: Array<{ value: string; label: string }>,
  values?: string[] | null,
) {
  if (!values?.length) {
    return "-";
  }

  return values.map((value) => formatConfigLabel(options, value)).join(", ");
}

function channelLabel(value?: string | null) {
  return value === "ep" ? "EPO" : formatConfigLabel(channelOptions, value);
}

function titleCase(value?: string | null) {
  if (!value) {
    return "-";
  }

  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
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
