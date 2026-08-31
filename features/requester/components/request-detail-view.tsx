import { ArrowLeft, ClipboardList, FileSearch } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { latestPublishedDeliverables } from "@/features/deliverables/delivery-progress";
import { mapPatentLookupResponse } from "@/features/requester/actions/patent-lookup";
import { PatentDetailStep } from "@/features/requester/components/patent-detail-step";
import { PatentCacheStatus } from "@/features/requester/components/patent-cache-status";
import {
  RequestFileInformation,
  type RequestInformationFile,
} from "@/features/requester/components/request-file-information";
import { RequestFilesDownloadButton } from "@/features/requester/components/request-files-download-button";
import { RequestDeadlinePanel } from "@/features/requester/components/request-deadline-panel";
import { RequestQuoteSheet } from "@/features/requester/components/request-quote-sheet";
import { RequesterDeliverablesDialog } from "@/features/requester/components/requester-deliverables-dialog";
import { RequesterHeader } from "@/features/requester/components/requester-header";
import {
  formatDate,
} from "@/features/requester/format";
import {
  buildRequestDeadlineItems,
  getRequestDeadlinePendingMessage,
} from "@/features/requester/deadlines";
import { RequesterStatusBadge } from "@/features/requester/requester-status";
import { RequesterSignaturePanel } from "@/features/filing-signatures/components/requester-signature-panel";
import type { FilingSignatureRequest } from "@/features/filing-signatures/types";
import {
  channelOptions,
  entityTypeOptions,
  filingApplicationTypeOptions,
  filingTypeOptions,
  jurisdictionOptions,
  mockUnitaryTargetLanguageOptions,
  serviceTypeOptions,
  sourceLanguageOptions,
  traditionalServiceItemOptions,
} from "@/features/requester/options";
import {
  isTraditionalValidation,
  requiresEpCountries,
  resolveServiceTypeSelection,
} from "@/features/requester/request-paths";
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
  ep_service_type_code?: string | null;
  translation_required?: boolean | null;
  service_item_code?: string | null;
  opt_out_country_ids?: number[] | null;
  pct_chapter_code?: string | null;
  ep_country_ids?: number[] | null;
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
  grant_publication_date?: string | null;
  rule_71_3_communication_date?: string | null;
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
  pricing_snapshot?: unknown;
  breakdown_json?: unknown;
  quote_items?: Array<{ label: string; amount: number | string }> | null;
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
      ep_country_id?: number | null;
      jurisdiction_code?: string | null;
    }> | null;
  }> | null;
};

type RequestDetail = {
  id: string;
  request_no: string;
  reference_no?: string | null;
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
  filing_signature_requests?: FilingSignatureRequest[] | null;
  ep_countries?: Array<{
    id: number;
    name: string;
    cname: string;
    abbr: string;
  }> | null;
  viewer_is_owner?: boolean;
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
  const deliverables = latestPublishedDeliverables(
    (((order?.translation_tasks ?? []) as NonNullable<Order["translation_tasks"]>) ?? [])
      .flatMap((task) => task.task_deliverables ?? []),
  );
  const isPatentSearch = request.source_mode === "patent_search";
  const showFileInformation = config.epServiceType === "ep_granting";
  const patentNumber = isPatentSearch ? patent?.patent_number ?? null : null;
  const patentCandidate = isPatentSearch && patent ? toPatentCandidate(patent) : null;
  const patentFile = files.find((file) => file.source === "patent_search");
  const entityType = requirement?.entity_type_code
    ?? requirement?.entity_type
    ?? config.entityType;
  const entityLabel = entityType
    ? formatConfigLabel(entityTypeOptions, entityType)
    : null;
  const organization = firstRelation(request.organizations);
  const serviceTypes = config.serviceTypes;
  const epCountries = request.ep_countries ?? [];
  const epCountryNames = config.epCountryIds.map((id) =>
    epCountries.find((country) => country.id === id)?.name ?? `EP country ${id}`,
  );
  const jurisdictionCodes = config.jurisdictionCodes;
  const dueAt = config.dueAt;
  const showFilingFields = serviceTypes.includes("filing");
  const isReadOnly = request.viewer_is_owner === false;
  const showServiceItem = isTraditionalValidation(config.epServiceType);
  const showDestinations = config.channelCode !== "ep"
    || requiresEpCountries(config.epServiceType);
  const serviceTypeLabel = resolveServiceTypeSelection(
    config.channelCode,
    serviceTypes,
    config.epvType,
    config.epServiceType,
  )?.label ?? formatConfigLabels(serviceTypeOptions, serviceTypes);
  const showDueDate = serviceTypes.includes("translation") && Boolean(dueAt);
  const deadlineItems = buildRequestDeadlineItems({
    id: request.id,
    request_no: request.request_no,
    channel_code: request.channel_code,
    submitted_at: request.submitted_at,
    workflow_stage: request.workflow_stage,
    requester_status: request.requester_status,
    translation_requirements: requirement,
    request_patents: patent,
  });
  const deadlinePendingMessage = getRequestDeadlinePendingMessage({
    id: request.id,
    request_no: request.request_no,
    channel_code: request.channel_code,
    submitted_at: request.submitted_at,
    workflow_stage: request.workflow_stage,
    requester_status: request.requester_status,
    translation_requirements: requirement,
    request_patents: patent,
  });
  const signatureRequests = request.filing_signature_requests ?? [];
  const leftColumnItems: DetailItem[] = [
    { label: "Organization", value: organization?.name ?? "-" },
    ...(request.reference_no
      ? [{ label: "Reference No.", value: request.reference_no }]
      : []),
    { label: "Updated", value: formatDate(request.updated_at) },
    {
      label: "Source Language",
      value: formatConfigLabel(
        sourceLanguageOptions,
        config.sourceLanguage,
      ),
    },
    {
      label: "Service type",
      value: serviceTypeLabel,
    },
    {
      label: "Translation",
      value: config.translationRequired ? "Required" : "Not required",
    },
    ...(config.targetLanguages.length
      ? [{
          label: "Target language(s)",
          value: formatConfigLabels(
            [...sourceLanguageOptions, ...mockUnitaryTargetLanguageOptions],
            config.targetLanguages,
          ),
        }]
      : []),
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
    ...(showServiceItem
      ? [{
          label: "Service Item",
          value: formatConfigLabel([...traditionalServiceItemOptions], config.serviceItem),
        }]
      : []),
  ];
  const rightColumnItems: DetailItem[] = [
    { label: "Submitted", value: formatDate(request.submitted_at) },
    {
      label: "Route",
      value: channelLabel(config.channelCode),
    },
    ...(showDestinations ? [{
      label: config.epCountryIds.length ? "EP countries" : "Jurisdictions",
      value: config.epCountryIds.length
        ? epCountryNames.join(", ") || "-"
        : formatConfigLabels(jurisdictionOptions, jurisdictionCodes),
    }] : []),
    ...(config.optOutCountryIds.length ? [{
      label: "Opt Out countries",
      value: config.optOutCountryIds.map((id) =>
        epCountries.find((country) => country.id === id)?.name ?? `EP country ${id}`
      ).join(", "),
    }] : []),
    {
      label: "Delivery option",
      value: titleCase(config.deliveryOption),
    },
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
    },
  ];
  return (
    <div className="flex h-full min-h-0 flex-col gap-6 overflow-hidden">
      <RequesterHeader
        title={patentNumber ?? request.request_no}
        description={`Request ${request.request_no}`}
        status={
          <RequesterStatusBadge
            status={request.requester_status}
            size="compact"
          />
        }
        action={
          <div className="flex flex-wrap items-start justify-end gap-3">
            <Button asChild variant="ghost" size="icon" className="size-11 text-foreground hover:bg-muted">
              <Link
                href={isReadOnly ? "/requester/requests?scope=organization" : "/requester/requests"}
                aria-label="Back to Requests"
                title="Back to Requests"
              >
                <ArrowLeft className="size-6" strokeWidth={3} />
                <span className="sr-only">Back to Requests</span>
              </Link>
            </Button>
            {order?.id && deliverables.length ? (
              <RequesterDeliverablesDialog
                deliverables={deliverables}
                orderId={order.id}
                requestId={request.id}
                totalJurisdictionCount={config.epCountryIds.length
                  ? config.epCountryIds.length
                  : jurisdictionCodes.length}
                epCountries={epCountries}
              />
            ) : null}
          </div>
        }
      />
      <div className="hide-scrollbar min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="flex flex-col gap-6 pr-1">
          {isReadOnly ? (
            <p className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100">
              This Request is shared by your organization. You have read-only access.
            </p>
          ) : null}
          <Section
            title="Request overview"
            icon={<ClipboardList className="size-5" />}
          >
            {deadlineItems.length || deadlinePendingMessage ? (
              <RequestDeadlinePanel
                items={deadlineItems}
                pendingMessage={deadlinePendingMessage}
              />
            ) : null}
            <section
              aria-label="Basic info"
              className="rounded-lg border border-border/70 bg-background p-4"
            >
              <h3 className="text-sm font-semibold">Basic info</h3>
              <div className="mt-4 grid items-start gap-5 md:grid-cols-2">
                <DetailsGrid items={leftColumnItems} columns="single" />
                <DetailsGrid items={rightColumnItems} columns="single" />
              </div>
            </section>
          </Section>
          {signatureRequests.length ? (
            <RequesterSignaturePanel signatureRequests={signatureRequests} canSubmit={!isReadOnly} />
          ) : null}
          {isPatentSearch ? (
            <>
              <Section
                title="Patent Information"
                icon={<FileSearch className="size-5" />}
              >
                <PatentCacheStatus
                  requestId={request.id}
                  status={patentFile?.status}
                  updatedAt={patentFile?.updated_at}
                  canRetry={!isReadOnly}
                />
                {patentCandidate ? (
                  <PatentDetailStep
                    patent={patentCandidate}
                    flushBibliographic
                    plainBibliographic
                    useParentScroll
                    additionalMetadata={[
                      ...(entityLabel ? [{ label: "Entity", value: entityLabel }] : []),
                      ...deadlineItems.map((item) => ({
                        label: item.title,
                        value: formatDate(item.dueOn),
                      })),
                    ]}
                  />
                ) : (
                  <p className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
                    No patent information is associated with this request.
                  </p>
                )}
              </Section>
              {showFileInformation ? (
                <RequestFileInformation
                  files={files}
                  action={
                    uploadedFiles.length ? (
                      <RequestFilesDownloadButton
                        href={`/requester/requests/${request.id}/download`}
                      />
                    ) : undefined
                  }
                />
              ) : null}
            </>
          ) : showFileInformation ? (
            <RequestFileInformation
              files={uploadedFiles}
              action={
                <RequestFilesDownloadButton
                  href={`/requester/requests/${request.id}/download`}
                />
              }
            />
          ) : null}
          <RequestQuoteSheet
            quote={latestQuote}
            isEpGranting={config.epServiceType === "ep_granting"}
            translationRequired={config.translationRequired}
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
    targetLanguages: snapshot.targetLanguages ?? requirement?.target_languages ?? [],
    translationRequired: snapshot.translationRequired
      ?? requirement?.translation_required
      ?? (requirement?.service_types ?? []).includes("translation"),
    epServiceType: snapshot.epServiceType
      ?? requirement?.ep_service_type_code as WizardConfig["epServiceType"]
      ?? "",
    epCountryIds: snapshot.epCountryIds ?? requirement?.ep_country_ids ?? [],
    optOutCountryIds: snapshot.optOutCountryIds
      ?? requirement?.opt_out_country_ids
      ?? [],
    epCountriesConfirmed: snapshot.epCountriesConfirmed
      ?? Boolean((requirement?.ep_country_ids ?? []).length),
    optOutCountriesConfirmed: snapshot.optOutCountriesConfirmed
      ?? Boolean((requirement?.opt_out_country_ids ?? []).length),
    serviceItem: snapshot.serviceItem
      ?? requirement?.service_item_code as WizardConfig["serviceItem"]
      ?? "",
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
    optType: snapshot.optType ?? "",
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
  icon,
  action,
  cardClassName,
  contentClassName,
  children,
}: {
  title: string;
  icon?: ReactNode;
  action?: ReactNode;
  cardClassName?: string;
  contentClassName?: string;
  children: ReactNode;
}) {
  return (
    <Card className={cardClassName ?? "h-full"}>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <CardTitle className="flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
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
