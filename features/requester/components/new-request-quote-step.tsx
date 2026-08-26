"use client";

import { ChevronDown } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { Table } from "@radix-ui/themes";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type {
  WizardPatentAnalysisFile,
  WizardPatentAnalysisStatus,
  WizardPayload,
  WizardUploadedFile,
} from "@/features/requester/wizard-types";
import {
  mockUnitaryTargetLanguageOptions,
  sourceLanguageOptions,
  traditionalServiceItemOptions,
} from "@/features/requester/options";
import {
  isTraditionalValidation,
  resolveServiceTypeSelection,
} from "@/features/requester/request-paths";
import {
  ERP_QUOTE_CURRENCIES,
  isErpQuoteCurrencyCode,
  type ErpQuoteCurrencyCode,
  type ErpQuotePreview,
} from "@/lib/eci-erp/types";
import { StepShell } from "./new-request-wizard-shared";
import { PatentProcessingNotice } from "./patent-processing-notice";
import { hasUsablePatentAnalysis } from "./new-request-wizard-utils";

export function QuoteStepContent({
  payload,
  action,
  analysisStatus = payload.analysis ? "complete" : "idle",
  analysisError,
  onAnalysisRetry,
  estimate,
  currency,
  onCurrencyChange,
}: {
  payload: WizardPayload;
  action?: ReactNode;
  analysisStatus?: WizardPatentAnalysisStatus;
  analysisError?: string;
  onAnalysisRetry?: () => void;
  estimate: ErpQuotePreview | null;
  currency: ErpQuoteCurrencyCode;
  onCurrencyChange: (currency: ErpQuoteCurrencyCode) => void;
}) {
  const analysisReady = hasUsablePatentAnalysis(payload);
  return (
    <StepShell
      title="Estimate Sheet"
      description="Review the estimate generated from the selected source package."
    >
      <div className="flex h-full min-h-0 flex-col gap-5 overflow-y-auto pr-1">
        {payload.sourceMode === "patent_search" ? (
          <PatentProcessingNotice
            status={analysisStatus}
            result={payload.analysis}
            error={analysisError}
            onRetry={onAnalysisRetry}
          />
        ) : null}
        {payload.sourceMode === "upload" ? (
          <UploadOverviewCard
            files={payload.uploadedFiles}
            analysisFiles={payload.analysis?.files ?? []}
          />
        ) : null}
        <RequestAuditCard payload={payload} />

        <section className="rounded-2xl border bg-card">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b px-6 py-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Estimate
              </p>
              <h3 className="mt-2 text-2xl font-semibold tracking-tight">
                {estimate ? formatCurrency(estimate.total, estimate.currency) : "Pending"}
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {analysisReady
                  ? "Live estimate for the current request configuration."
                  : "Word counts and estimate details will appear when patent processing completes."}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Select
                value={currency}
                onValueChange={(value) => {
                  if (isErpQuoteCurrencyCode(value)) onCurrencyChange(value);
                }}
              >
                <SelectTrigger className="w-[180px]" aria-label="Quote currency">
                  <SelectValue placeholder="Currency" />
                </SelectTrigger>
                <SelectContent>
                  {ERP_QUOTE_CURRENCIES.map((option) => (
                    <SelectItem key={option.code} value={option.code}>
                      {option.code} · {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {action}
            </div>
          </div>
          <div className="overflow-hidden">
            {analysisReady && estimate?.rows.length ? (
              <Table.Root
                size="2"
                variant="ghost"
                layout="fixed"
                className="w-full table-fixed text-xs [&_td]:!px-3 [&_th]:!px-3"
              >
                <Table.Header>
                  <Table.Row className="hover:bg-transparent">
                    <Table.ColumnHeaderCell>Country</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell justify="end">Official Fee</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell justify="end">Service Fee</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell justify="end">Translation Fee</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell justify="end">Total</Table.ColumnHeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {estimate.rows.map((row) => {
                    const translationDetails = row.translationFeeDetails.length
                      ? row.translationFeeDetails
                      : [{ languageId: 0, languageName: "", amount: row.translationFee }];
                    return (
                      <Fragment key={row.countryId}>
                        {translationDetails.map((detail, index) => (
                          <Table.Row key={`${row.countryId}-${detail.languageId || index}`}>
                            {index === 0 ? (
                              <>
                                <Table.RowHeaderCell rowSpan={translationDetails.length} className="font-medium">
                                  {row.countryName}
                                </Table.RowHeaderCell>
                                <Table.Cell rowSpan={translationDetails.length} className="whitespace-nowrap" justify="end">
                                  {formatCurrency(row.officialFee, estimate.currency)}
                                </Table.Cell>
                                <Table.Cell rowSpan={translationDetails.length} className="whitespace-nowrap" justify="end">
                                  {formatCurrency(row.serviceFee, estimate.currency)}
                                </Table.Cell>
                              </>
                            ) : null}
                            <Table.Cell className="whitespace-nowrap" justify="end">
                              <span className="mr-3 text-muted-foreground">{detail.languageName}</span>
                              {formatCurrency(detail.amount, estimate.currency)}
                            </Table.Cell>
                            {index === 0 ? (
                              <Table.Cell rowSpan={translationDetails.length} justify="end" className="whitespace-nowrap font-semibold">
                                {formatCurrency(row.total, estimate.currency)}
                              </Table.Cell>
                            ) : null}
                          </Table.Row>
                        ))}
                      </Fragment>
                    );
                  })}
                  <Table.Row className="bg-muted/20 [--table-row-box-shadow:none]">
                    <Table.Cell
                      colSpan={4}
                      justify="end"
                      className="text-sm font-semibold"
                    >
                      Estimated Total
                    </Table.Cell>
                    <Table.Cell justify="end" className="text-base font-semibold">
                      {formatCurrency(estimate.total, estimate.currency)}
                    </Table.Cell>
                  </Table.Row>
                </Table.Body>
              </Table.Root>
            ) : (
              <div className="px-6 py-10 text-sm text-muted-foreground">
                {analysisReady
                  ? "No live estimate is available for this configuration."
                  : "No provisional or mock word counts are shown while patent processing is incomplete."}
              </div>
            )}
          </div>
        </section>
      </div>
    </StepShell>
  );
}

function RequestAuditCard({ payload }: { payload: WizardPayload }) {
  const { config, analysis } = payload;
  const source = analysis?.source_document;
  const serviceLabel = resolveServiceTypeSelection(
    config.channelCode,
    config.serviceTypes,
    config.epvType,
    config.epServiceType,
  )?.label ?? config.epServiceType ?? "-";
  const languageOptions = [...sourceLanguageOptions, ...mockUnitaryTargetLanguageOptions];
  const partLabels: Record<string, string> = {
    abstract: "Abstract",
    abstract_drawing: "Abstract drawing",
    description: "Description",
    description_drawings: "Description drawings",
    claims: "Claims",
  };
  const analysisFile = analysis?.files[0];
  const visiblePartLabels = analysis?.analysis_profile === "claims_only"
    ? { claims: partLabels.claims }
    : partLabels;

  return (
    <section className="space-y-4 rounded-2xl border bg-card p-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Request audit</p>
        <h3 className="mt-2 text-lg font-semibold">{serviceLabel}</h3>
      </div>
      <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <AuditField label="Translation" value={config.translationRequired ? "Required" : "Not required"} />
        {isTraditionalValidation(config.epServiceType) ? (
          <AuditField label="Service Item" value={labelFor(traditionalServiceItemOptions, config.serviceItem)} />
        ) : null}
        <AuditField label="Source Language" value={labelFor(languageOptions, config.sourceLanguage)} />
        <AuditField label="Target Language(s)" value={config.targetLanguages.map((value) => labelFor(languageOptions, value)).join(", ") || "-"} />
        <AuditField label="EP countries" value={config.epCountryIds.join(", ") || "-"} />
        <AuditField label="Opt Out subset" value={config.optOutCountryIds.join(", ") || "-"} />
        <AuditField label="Document" value={source?.document_kind ?? source?.kind_code ?? "-"} />
        <AuditField label="Retrieval" value={source?.retrieval_mode ?? "-"} />
        <AuditField label="Publication date" value={source?.publication_date ?? "-"} />
        <AuditField label="Document date" value={source?.document_date ?? "-"} />
        <AuditField label="Document language" value={source?.language?.toUpperCase() ?? "-"} />
        <AuditField label="Pre-grant" value={source?.is_pre_grant ? source.is_legacy_pre_grant ? "Yes · legacy" : "Yes" : "No"} />
      </dl>
      {source?.source_url || source?.upstream_url ? (
        <p className="break-all text-xs"><span className="text-muted-foreground">Source URL: </span>{source.source_url ?? source.upstream_url}</p>
      ) : null}
      {source?.sha256 || analysisFile?.sha256 ? (
        <p className="break-all font-mono text-[11px]"><span className="font-sans text-muted-foreground">SHA-256: </span>{source?.sha256 ?? analysisFile?.sha256}</p>
      ) : null}
      {analysisFile ? (
        <div className={`grid gap-2 ${analysis?.analysis_profile === "claims_only" ? "sm:grid-cols-1" : "sm:grid-cols-2 lg:grid-cols-5"}`}>
          {Object.entries(visiblePartLabels).map(([key, label]) => {
            const part = analysisFile.parts[key as keyof typeof analysisFile.parts];
            return (
              <div key={key} className="rounded-md border bg-muted/10 px-3 py-2 text-xs">
                <p className="font-medium">{label}</p>
                <p className="mt-1 text-muted-foreground">{part.status} · {part.word_count.toLocaleString()} words</p>
              </div>
            );
          })}
        </div>
      ) : null}
      {analysis?.analysis_profile === "claims_only" ? (
        <p className="text-xs text-muted-foreground">
          EP Granting uses claims-only analysis; other document sections were not processed.
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Claims: {(analysis?.aggregate.claims_words ?? 0).toLocaleString()} words · {(analysis?.aggregate.claims_count ?? 0).toLocaleString()} items
      </p>
    </section>
  );
}

function AuditField({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 font-medium">{value || "-"}</dd></div>;
}

function labelFor(
  options: readonly { value: string; label: string }[],
  value?: string | null,
) {
  if (!value) return "-";
  return options.find((option) => option.value === value)?.label ?? value;
}

function UploadOverviewCard({
  files,
  analysisFiles,
}: {
  files: WizardUploadedFile[];
  analysisFiles: WizardPatentAnalysisFile[];
}) {
  return (
    <details className="group rounded-2xl border bg-card">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Uploaded Source Files
          </p>
          <h3 className="mt-2 text-2xl font-semibold tracking-tight">
            {files.length} file{files.length === 1 ? "" : "s"} staged for estimate
          </h3>
        </div>
        <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t px-6 py-5">
        <div className="space-y-3">
          {files.map((file, index) => {
            const analyzedFile = findAnalysisFile(analysisFiles, file.name, index);

            return (
              <div
                key={`${file.name}-${index}`}
                className="grid gap-2 rounded-xl border px-4 py-3 text-sm md:grid-cols-[1.5fr_0.7fr_0.8fr_0.9fr]"
              >
                <span className="font-medium">{file.name}</span>
                <span className="text-muted-foreground">{file.type || "unknown"}</span>
                <span className="text-muted-foreground">
                  {Math.ceil(file.size / 1024).toLocaleString()} KB
                </span>
                <span className="text-muted-foreground md:text-right">
                  {analyzedFile
                    ? `${analyzedFile.total_words.toLocaleString()} total words`
                    : "Total words pending"}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </details>
  );
}

function findAnalysisFile(
  analysisFiles: WizardPatentAnalysisFile[],
  filename: string,
  index: number,
) {
  const indexedFile = analysisFiles[index];
  if (indexedFile?.filename === filename) {
    return indexedFile;
  }

  const normalizedFilename = filename.toLocaleLowerCase();
  return analysisFiles.find(
    (file) => file.filename.toLocaleLowerCase() === normalizedFilename,
  );
}

function formatCurrency(value: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}
