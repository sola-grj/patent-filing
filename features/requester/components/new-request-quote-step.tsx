"use client";

import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { Table } from "@radix-ui/themes";

import type {
  WizardDictionaries,
  WizardPatentAnalysisFile,
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
import { StepShell } from "./new-request-wizard-shared";
import { PatentDetailStep } from "./patent-detail-step";
import { PatentProcessingNotice } from "./patent-processing-notice";
import { hasUsablePatentAnalysis } from "./new-request-wizard-utils";

export function QuoteStepContent({
  payload,
  action,
  dictionaries,
  analysisStatus = payload.analysis ? "complete" : "idle",
  analysisError,
  onAnalysisRetry,
}: {
  payload: WizardPayload;
  action?: ReactNode;
  dictionaries: WizardDictionaries;
  analysisStatus?: WizardPatentAnalysisStatus;
  analysisError?: string;
  onAnalysisRetry?: () => void;
}) {
  const analysisReady = hasUsablePatentAnalysis(payload);
  const estimateRows = buildEstimateRows(payload, dictionaries);
  const includeTranslation = hasTranslationPricing(payload);
  const total = estimateRows.reduce((sum, row) => sum + row.total, 0);
  const entityLabel = labelFor(dictionaries.entityTypes, payload.config.entityType);

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
        {payload.sourceMode === "patent_search" && payload.selectedPatent ? (
          <PatentOverviewCard patent={payload.selectedPatent} entityLabel={entityLabel} />
        ) : (
          <UploadOverviewCard
            files={payload.uploadedFiles}
            analysisFiles={payload.analysis?.files ?? []}
          />
        )}

        <section className="rounded-2xl border bg-card">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b px-6 py-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Estimate
              </p>
              <h3 className="mt-2 text-2xl font-semibold tracking-tight">
                {analysisReady ? formatCurrency(total) : "Pending"}
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {analysisReady
                  ? "Calculated from the current request configuration and analyzed patent data."
                  : "Word counts and estimate details will appear when patent processing completes."}
              </p>
            </div>
            {action ? <div className="shrink-0">{action}</div> : null}
          </div>
          <div className="overflow-hidden">
            {analysisReady && estimateRows.length ? (
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
                {analysisReady
                  ? "Estimate rows will appear after at least one jurisdiction is selected."
                  : "No provisional or mock word counts are shown while patent processing is incomplete."}
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
