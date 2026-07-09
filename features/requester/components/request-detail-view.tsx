import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RequesterHeader } from "@/features/requester/components/requester-header";
import {
  StatusBadge,
  formatCurrency,
  formatDate,
} from "@/features/requester/format";
import {
  entityTypeOptions,
  purposeOptions,
  qualityOptions,
  serviceTypeOptions,
  scopeOptions,
  sourceLanguageOptions,
  targetLanguageOptions,
} from "@/features/requester/options";
import { RequesterStatusBadge } from "@/features/requester/requester-status";

type RequestFile = {
  id: string;
  original_filename: string;
  status: string;
  file_role?: string | null;
  language?: string | null;
  source: string;
  version_label?: string | null;
  metadata?: {
    patent_file?: {
      pageCount?: number;
      wordCount?: number;
      claimCount?: number;
    };
  } | null;
  file_parse_results?: ParseResult | ParseResult[] | null;
};

type ParseResult = {
  page_count: number;
  word_count: number;
  claim_count: number;
};

type PatentFileVersion = {
  id: string;
};

type PatentCandidate = {
  id: string;
  patent_number?: string | null;
  patent_file_versions?: PatentFileVersion[] | null;
};

type PatentSearch = {
  id: string;
  patent_candidates?: PatentCandidate[] | null;
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
  title?: string | null;
  workflow_stage?: string | null;
  requester_status?: string | null;
  submitted_at?: string | null;
  request_files?: RequestFile[] | null;
  patent_searches?: PatentSearch[] | null;
  translation_requirements?: TranslationRequirement | TranslationRequirement[] | null;
  request_config_versions?: RequestConfigVersion[] | null;
  quotes?: Quote[] | null;
  quote_negotiations?: QuoteNegotiation[] | null;
  orders?: Order | Order[] | null;
};

export function RequestDetailView({ request }: { request: RequestDetail }) {
  const files = request.request_files ?? [];
  const patentSearch = (request.patent_searches ?? [])[0] ?? null;
  const patent = patentSearch?.patent_candidates?.[0] ?? null;
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
  const sourceLanguage = formatConfigLabel(
    sourceLanguageOptions,
    requirement?.source_language ?? config?.sourceLanguage,
  );
  const targetLanguage = formatConfigLabels(
    targetLanguageOptions,
    requirement?.target_languages?.length
      ? requirement.target_languages
      : requirement?.target_language
        ? [requirement.target_language]
        : toTargetLanguageArray(config),
  );
  const patentNumber = patent?.patent_number ?? null;
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
    { label: "Language pair", value: `${sourceLanguage} → ${targetLanguage}` },
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
  const patentItems: DetailItem[] = [
    {
      label: "Scope",
      value: formatConfigLabel(
        scopeOptions,
        requirement?.scope_type ?? config?.scopeType,
      ),
    },
    {
      label: "Purpose",
      value: formatConfigLabel(
        purposeOptions,
        requirement?.purpose ?? config?.purpose,
      ),
    },
    {
      label: "Service type",
      value: formatConfigLabels(
        serviceTypeOptions,
        requirement?.service_types ?? config?.serviceTypes,
      ),
    },
    {
      label: "Entity type",
      value: formatConfigLabel(
        entityTypeOptions,
        requirement?.entity_type ?? config?.entityType,
      ),
    },
    {
      label: "Quality",
      value: formatConfigLabel(
        qualityOptions,
        requirement?.quality_level ?? config?.qualityLevel,
      ),
    },
    {
      label: "Due date",
      value: formatDate(requirement?.due_at ?? config?.dueAt),
    },
    {
      label: "Other notes",
      value:
        config?.customScope ??
        requirement?.scope_details?.customScope ??
        "-",
      className: "md:col-span-2",
    },
    {
      label: "Urgent",
      value: (requirement?.is_urgent ?? config?.isUrgent) ? "Yes" : "No",
    },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col gap-6 overflow-hidden">
      <RequesterHeader
        title={request.title ?? request.request_no}
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
          contentClassName="hide-scrollbar min-h-0 flex-1 space-y-6 overflow-y-auto"
          action={
            configVersion ? (
              <span className="text-xs text-muted-foreground">
                Config v{configVersion.version_no}
              </span>
            ) : null
          }
        >
          {patentNumber ? (
            <div>
              <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
                Patent number
              </p>
              <p className="mt-2 text-sm leading-6">{patentNumber}</p>
            </div>
          ) : null}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">
                Patent files for translation
              </p>
              <span className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
                {files.length} file{files.length === 1 ? "" : "s"}
              </span>
            </div>
            {files.length ? (
              <div className="space-y-3">
                {files.map((file) => (
                  <PatentFileCard key={file.id} file={file} />
                ))}
              </div>
            ) : (
              <p className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
                No patent files were selected for translation.
              </p>
            )}
          </div>
          <DetailsGrid items={patentItems} />
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

  return values
    .map((value) => options.find((option) => option.value === value)?.label ?? value)
    .join(", ");
}

function toTargetLanguageArray(
  config?: TranslationRequirement["config_snapshot"] | null,
) {
  if (config?.targetLanguages?.length) {
    return config.targetLanguages;
  }
  if (config?.targetLanguage) {
    return [config.targetLanguage];
  }
  return [];
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
  return (
    <div className={columns === "single" ? "grid gap-4" : "grid gap-4 md:grid-cols-2"}>
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

function PatentFileCard({ file }: { file: RequestFile }) {
  const result = firstRelation(file.file_parse_results);

  return (
    <div className="rounded-lg border p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{file.original_filename}</p>
            <StatusBadge status={file.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            {file.file_role ?? file.version_label ?? "Patent file"}
            {" · "}
            {(file.language ?? "unknown").toUpperCase()}
            {" · "}
            {file.source === "patent_search" ? "Patent search" : "Upload"}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3 text-sm text-muted-foreground">
          <MetricItem
            label="Words"
            value={result?.word_count ?? file.metadata?.patent_file?.wordCount ?? "-"}
          />
          <MetricItem
            label="Pages"
            value={result?.page_count ?? file.metadata?.patent_file?.pageCount ?? "-"}
          />
          <MetricItem
            label="Claims"
            value={result?.claim_count ?? file.metadata?.patent_file?.claimCount ?? "-"}
          />
        </div>
      </div>
    </div>
  );
}

function MetricItem({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="min-w-20 rounded-md bg-muted/30 px-3 py-2 text-center">
      <p className="text-[11px] uppercase tracking-[0.08em]">{label}</p>
      <p className="mt-1 text-sm font-medium">
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
    </div>
  );
}
