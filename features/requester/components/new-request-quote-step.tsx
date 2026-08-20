"use client";

import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
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
                  ? "Live estimate returned by ECI ERP for the current request configuration."
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
                  {estimate.rows.map((row) => (
                    <Table.Row key={row.countryId}>
                      <Table.RowHeaderCell className="font-medium">
                        {row.countryName}
                      </Table.RowHeaderCell>
                      <Table.Cell className="whitespace-nowrap" justify="end">{formatCurrency(row.officialFee, estimate.currency)}</Table.Cell>
                      <Table.Cell className="whitespace-nowrap" justify="end">{formatCurrency(row.serviceFee, estimate.currency)}</Table.Cell>
                      <Table.Cell className="whitespace-nowrap" justify="end">{formatCurrency(row.translationFee, estimate.currency)}</Table.Cell>
                      <Table.Cell justify="end" className="whitespace-nowrap font-semibold">
                        {formatCurrency(row.total, estimate.currency)}
                      </Table.Cell>
                    </Table.Row>
                  ))}
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
                  ? "No live ERP estimate is available for this configuration."
                  : "No provisional or mock word counts are shown while patent processing is incomplete."}
              </div>
            )}
          </div>
        </section>
      </div>
    </StepShell>
  );
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

function formatCurrency(value: number, currency = "EUR") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}
