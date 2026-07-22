"use client";

import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { Table } from "@radix-ui/themes";

import type {
  WizardDictionaries,
  WizardPatentAnalysisStatus,
  WizardPatentCandidate,
  WizardPayload,
  WizardUploadedFile,
} from "@/features/requester/wizard-types";
import {
  buildEstimateRows,
  hasTranslationPricing,
  labelFor,
} from "./new-request-quote-pricing";
import { parsePreviewFiles } from "./new-request-wizard-utils";
import { StepShell } from "./new-request-wizard-shared";
import { PatentDetailStep } from "./patent-detail-step";

export function QuoteStepContent({
  payload,
  action,
  dictionaries,
  analysisStatus = payload.analysis ? "complete" : "idle",
  analysisError,
}: {
  payload: WizardPayload;
  action?: ReactNode;
  dictionaries: WizardDictionaries;
  analysisStatus?: WizardPatentAnalysisStatus;
  analysisError?: string;
}) {
  const files = parsePreviewFiles(payload);
  const estimateRows = buildEstimateRows(payload, dictionaries);
  const includeTranslation = hasTranslationPricing(payload);
  const total = estimateRows.reduce((sum, row) => sum + row.total, 0);
  const entityLabel = labelFor(dictionaries.entityTypes, payload.config.entityType);

  return (
    <StepShell
      title="Estimate Sheet"
      description="Review the mocked estimate generated from the selected source package."
    >
      <div className="flex h-full min-h-0 flex-col gap-5 overflow-y-auto pr-1">
        {payload.sourceMode === "patent_search" && payload.selectedPatent ? (
          <PatentOverviewCard patent={payload.selectedPatent} entityLabel={entityLabel} />
        ) : (
          <UploadOverviewCard
            files={payload.uploadedFiles}
            parsedFileCount={files.length}
            entityLabel={entityLabel}
          />
        )}

        <section className="rounded-2xl border bg-card">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b px-6 py-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Mock Estimate
              </p>
              <h3 className="mt-2 text-2xl font-semibold tracking-tight">
                {formatCurrency(total)}
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {includeTranslation
                  ? "Filing, official, and translation line items are mocked for now."
                  : "Filing and official line items are mocked for now."}
              </p>
              {includeTranslation ? (
                <AnalysisStatus
                  status={analysisStatus}
                  error={analysisError}
                  hasResult={Boolean(payload.analysis)}
                />
              ) : null}
            </div>
            {action ? <div className="shrink-0">{action}</div> : null}
          </div>
          <div className="overflow-hidden">
            {estimateRows.length ? (
              <Table.Root
                size="2"
                variant="ghost"
                layout="fixed"
                className={includeTranslation
                  ? "w-full table-fixed text-xs [&_td]:!px-2 [&_th]:!px-2"
                  : "w-full"}
              >
                <Table.Header>
                  <Table.Row className="hover:bg-transparent">
                    <Table.ColumnHeaderCell className={includeTranslation ? "w-[10%]" : undefined}>Jurisdiction</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell className={includeTranslation ? "w-[10%]" : undefined}>Patent Language</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell className={includeTranslation ? "w-[8%]" : undefined} justify="end">Filing Fee</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell className={includeTranslation ? "w-[8%]" : undefined} justify="end">Official Fee</Table.ColumnHeaderCell>
                    {includeTranslation ? (
                      <>
                        <Table.ColumnHeaderCell className="w-[16%] leading-tight" justify="center">Translation Requirement</Table.ColumnHeaderCell>
                        <Table.ColumnHeaderCell className="w-[12%] leading-tight" justify="center">Translation Words</Table.ColumnHeaderCell>
                        <Table.ColumnHeaderCell className="w-[11%]" justify="end">Unit Price</Table.ColumnHeaderCell>
                        <Table.ColumnHeaderCell className="w-[13%] leading-tight" justify="end">Translation Fee</Table.ColumnHeaderCell>
                      </>
                    ) : null}
                    <Table.ColumnHeaderCell className={includeTranslation ? "w-[12%]" : undefined} justify="end">Total</Table.ColumnHeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {estimateRows.map((row) => (
                    <Table.Row key={row.jurisdiction}>
                      <Table.RowHeaderCell className="font-medium">
                        {row.jurisdiction}
                      </Table.RowHeaderCell>
                      <Table.Cell>{row.sourceLanguage}</Table.Cell>
                      <Table.Cell className="whitespace-nowrap" justify="end">{formatCurrency(row.filingFee)}</Table.Cell>
                      <Table.Cell className="whitespace-nowrap" justify="end">{formatCurrency(row.officialFee)}</Table.Cell>
                      {includeTranslation ? (
                        <>
                          <Table.Cell justify="center">{row.translationRequirement}</Table.Cell>
                          <Table.Cell className="whitespace-nowrap" justify="center">{row.translationWords.toLocaleString()}</Table.Cell>
                          <Table.Cell className="whitespace-nowrap" justify="end">{formatUnitPrice(row.translationUnitPrice)}</Table.Cell>
                          <Table.Cell className="whitespace-nowrap" justify="end">{formatCurrency(row.translationFee)}</Table.Cell>
                        </>
                      ) : null}
                      <Table.Cell justify="end" className="whitespace-nowrap font-semibold">
                        {formatCurrency(row.total)}
                      </Table.Cell>
                    </Table.Row>
                  ))}
                  <Table.Row className="bg-muted/20 [--table-row-box-shadow:none]">
                    <Table.Cell
                      colSpan={includeTranslation ? 8 : 4}
                      justify="end"
                      className="text-sm font-semibold"
                    >
                      Estimated Total
                    </Table.Cell>
                    <Table.Cell justify="end" className="text-base font-semibold">
                      {formatCurrency(total)}
                    </Table.Cell>
                  </Table.Row>
                </Table.Body>
              </Table.Root>
            ) : (
              <div className="px-6 py-10 text-sm text-muted-foreground">
                Estimate rows will appear after at least one jurisdiction is selected.
              </div>
            )}
          </div>
        </section>
      </div>
    </StepShell>
  );
}

function PatentOverviewCard({
  patent,
  entityLabel,
}: {
  patent: WizardPatentCandidate;
  entityLabel: string;
}) {
  return (
    <details className="group rounded-2xl border bg-card">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5">
        <p className="text-sm font-bold uppercase tracking-[0.2em]">Patent Detail</p>
        <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t px-6 py-5">
        <PatentDetailStep
          patent={patent}
          additionalMetadata={[{ label: "Entity", value: entityLabel }]}
          plainBibliographic
        />
      </div>
    </details>
  );
}

function UploadOverviewCard({
  files,
  parsedFileCount,
  entityLabel,
}: {
  files: WizardUploadedFile[];
  parsedFileCount: number;
  entityLabel: string;
}) {
  const totalSizeKb = files.reduce((sum, file) => sum + Math.ceil(file.size / 1024), 0);

  return (
    <section className="rounded-2xl border bg-card">
      <div className="border-b px-6 py-5">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Uploaded Source Files
        </p>
        <h3 className="mt-2 text-2xl font-semibold tracking-tight">
          {files.length} file{files.length === 1 ? "" : "s"} staged for estimate
        </h3>
      </div>
      <div className="grid gap-5 px-6 py-5 lg:grid-cols-[0.7fr_1.3fr]">
        <div className="grid gap-3 rounded-2xl bg-muted/20 p-4 sm:grid-cols-2">
          <MetricCard label="Files" value={String(files.length || parsedFileCount)} />
          <MetricCard label="Total Size" value={`${totalSizeKb.toLocaleString()} KB`} />
          <MetricCard label="Package Type" value="Custom upload" />
          <MetricCard label="Entity" value={entityLabel} />
        </div>
        <div className="space-y-3">
          {files.map((file, index) => (
            <div
              key={`${file.name}-${index}`}
              className="grid gap-2 rounded-xl border px-4 py-3 text-sm md:grid-cols-[1.5fr_0.7fr_0.8fr]"
            >
              <span className="font-medium">{file.name}</span>
              <span className="text-muted-foreground">{file.type || "unknown"}</span>
              <span className="text-muted-foreground">
                {Math.ceil(file.size / 1024).toLocaleString()} KB
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function AnalysisStatus({
  status,
  error,
  hasResult,
}: {
  status: WizardPatentAnalysisStatus;
  error?: string;
  hasResult: boolean;
}) {
  const message = status === "pending"
    ? "Patent analysis is running in the background. Mock word counts are shown until it completes."
    : status === "error"
      ? `${error ?? "Patent analysis did not complete."} Mock word counts are shown.`
      : hasResult
        ? "Patent analysis completed. Translation word counts use the analysis result."
        : "Mock translation word counts are shown.";
  return <p className="mt-2 text-xs text-muted-foreground">{message}</p>;
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-background px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-lg font-semibold tracking-tight">{value}</p>
    </div>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatUnitPrice(value: number) {
  return `${formatCurrency(value)} / word`;
}
