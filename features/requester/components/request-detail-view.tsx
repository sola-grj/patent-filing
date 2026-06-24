import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RequesterHeader } from "@/features/requester/components/requester-header";
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
  scope_type?: string | null;
  scope_details?: { customScope?: string } | null;
  purpose?: string | null;
  quality_level?: string | null;
  delivery_option?: string | null;
  due_at?: string | null;
  is_urgent?: boolean | null;
  config_snapshot?: {
    customScope?: string;
    sourceLanguage?: string;
    targetLanguage?: string;
    scopeType?: string;
    purpose?: string;
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

type Order = {
  id: string;
  assignment_contacts?: {
    pm_names?: string | null;
    linguist_names?: string | null;
  } | null;
};

type RequestDetail = {
  id: string;
  request_no: string;
  title?: string | null;
  workflow_stage?: string | null;
  requester_status?: string | null;
  submitted_at?: string | null;
  request_files?: RequestFile[] | null;
  patent_searches?: PatentSearch[] | null;
  translation_requirements?: TranslationRequirement | TranslationRequirement[] | null;
  request_config_versions?: RequestConfigVersion[] | null;
  quotes?: Quote[] | null;
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
  const order = firstRelation(request.orders);
  const latestQuoteValue = latestQuote
    ? formatCurrency(latestQuote.total_amount, latestQuote.currency ?? "USD")
    : null;
  const assignmentContacts = order?.assignment_contacts ?? null;
  const showAssignees =
    Boolean(order?.id) &&
    (request.requester_status === "in_progress" || request.requester_status === "completed");
  const sourceLanguage = formatConfigLabel(
    sourceLanguageOptions,
    requirement?.source_language ?? config?.sourceLanguage,
  );
  const targetLanguage = formatConfigLabel(
    targetLanguageOptions,
    requirement?.target_language ?? config?.targetLanguage,
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
      label: "Quality",
      value: formatConfigLabel(
        qualityOptions,
        requirement?.quality_level ?? config?.qualityLevel,
      ),
    },
    {
      label: "Delivery",
      value: formatEnumLabel(
        requirement?.delivery_option ?? config?.deliveryOption,
      ),
    },
    {
      label: "Due date",
      value: formatDate(requirement?.due_at ?? config?.dueAt),
    },
    {
      label: "Urgent",
      value: (requirement?.is_urgent ?? config?.isUrgent) ? "Yes" : "No",
    },
    {
      label: "Other notes",
      value:
        config?.customScope ??
        requirement?.scope_details?.customScope ??
        "-",
      className: "md:col-span-2",
    },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col gap-6 overflow-hidden">
      <RequesterHeader
        title={request.title ?? request.request_no}
        description={`Request ${request.request_no}`}
      />
      <div className="grid min-h-0 flex-1 gap-6 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
        <Section
          title="Request Information"
          cardClassName="h-full min-h-0"
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
          <DetailsGrid items={requestItems} />
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

function formatEnumLabel(value?: string | null) {
  return value ? titleCaseStatus(value) : "-";
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

function DetailsGrid({ items }: { items: DetailItem[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
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
