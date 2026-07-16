"use client";

import type { ReactNode } from "react";
import { Table } from "@radix-ui/themes";

import { sourceLanguageOptions } from "@/features/requester/options";
import type {
  WizardDictionaries,
  WizardPatentCandidate,
  WizardPayload,
  WizardUploadedFile,
} from "@/features/requester/wizard-types";
import { parsePreviewFiles } from "./new-request-wizard-utils";
import { StepShell } from "./new-request-wizard-shared";

type EstimateRow = {
  jurisdiction: string;
  sourceLanguage: string;
  filingFee: number;
  officialFee: number;
  translationFee: number;
  total: number;
};

export function QuoteStepContent({
  payload,
  action,
  dictionaries,
}: {
  payload: WizardPayload;
  action?: ReactNode;
  dictionaries: WizardDictionaries;
}) {
  const files = parsePreviewFiles(payload);
  const estimateRows = buildEstimateRows(payload, dictionaries);
  const total = estimateRows.reduce((sum, row) => sum + row.total, 0);

  return (
    <StepShell
      title="Estimate Sheet"
      description="Review the mocked estimate generated from the selected source package."
    >
      <div className="flex h-full min-h-0 flex-col gap-5 overflow-y-auto pr-1">
        {payload.sourceMode === "patent_search" && payload.selectedPatent ? (
          <PatentOverviewCard
            patent={payload.selectedPatent}
            payload={payload}
            dictionaries={dictionaries}
          />
        ) : (
          <UploadOverviewCard
            files={payload.uploadedFiles}
            parsedFileCount={files.length}
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
                Filing, official, and translation line items are mocked for now
                and are persisted with the request when it is submitted.
              </p>
            </div>
            {action ? <div className="shrink-0">{action}</div> : null}
          </div>
          <div>
            {estimateRows.length ? (
              <Table.Root size="2" variant="ghost" layout="fixed" className="w-full">
                <Table.Header>
                  <Table.Row className="hover:bg-transparent">
                    <Table.ColumnHeaderCell>Jurisdiction</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>Patent Language</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell justify="end">Filing Fee</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell justify="end">Official Fee</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell justify="end">Translation Fee</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell justify="end">Total</Table.ColumnHeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {estimateRows.map((row) => (
                    <Table.Row key={row.jurisdiction}>
                      <Table.RowHeaderCell className="font-medium">
                        {row.jurisdiction}
                      </Table.RowHeaderCell>
                      <Table.Cell>{row.sourceLanguage}</Table.Cell>
                      <Table.Cell justify="end">{formatCurrency(row.filingFee)}</Table.Cell>
                      <Table.Cell justify="end">{formatCurrency(row.officialFee)}</Table.Cell>
                      <Table.Cell justify="end">{formatCurrency(row.translationFee)}</Table.Cell>
                      <Table.Cell justify="end" className="font-semibold">
                        {formatCurrency(row.total)}
                      </Table.Cell>
                    </Table.Row>
                  ))}
                  <Table.Row className="bg-muted/20 [--table-row-box-shadow:none]">
                    <Table.Cell colSpan={5} justify="end" className="text-sm font-semibold">
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
  payload,
  dictionaries,
}: {
  patent: WizardPatentCandidate;
  payload: WizardPayload;
  dictionaries: WizardDictionaries;
}) {
  return (
    <section className="rounded-2xl border bg-card">
      <div className="px-6 py-5">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-foreground">
          Patent Detail
        </p>
        <div className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
          <DetailItem label="Applicants" value={patent.applicants.join(", ")} />
          <DetailItem label="Inventors" value={patent.inventors.join(", ")} />
          <DetailItem label="Application Date" value={patent.filingDate} />
          <DetailItem label="Application No" value={patent.applicationNo} />
          <DetailItem label="Publication Date" value={patent.publicationDate} />
          <DetailItem label="Publication No" value={patent.publicationNo} />
          <DetailItem label="Language" value={patent.language ?? ""} />
          <DetailItem label="First Priority Date" value={patent.firstPriorityDate ?? ""} />
          <DetailItem label="International Filing Date" value={patent.internationalFilingDate ?? ""} />
          <DetailItem label="30-Month Filing Deadline" value={patent.filingDeadline30Months ?? ""} />
          <DetailItem label="31-Month Filing Deadline" value={patent.filingDeadline31Months ?? ""} />
          <DetailItem label="Total Pages" value={String(patent.totalPages ?? 0)} />
          <DetailItem
            label="Entity"
            value={labelFor(dictionaries.entityTypes, payload.config.entityType)}
          />
        </div>
      </div>
    </section>
  );
}

function UploadOverviewCard({
  files,
  parsedFileCount,
}: {
  files: WizardUploadedFile[];
  parsedFileCount: number;
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
        <p className="mt-2 text-sm text-muted-foreground">
          Basic source package information is shown here when the request starts from manual upload.
        </p>
      </div>
      <div className="grid gap-5 px-6 py-5 lg:grid-cols-[0.7fr_1.3fr]">
        <div className="grid gap-3 rounded-2xl bg-muted/20 p-4 sm:grid-cols-2">
          <MetricCard label="Files" value={String(files.length || parsedFileCount)} />
          <MetricCard label="Total Size" value={`${totalSizeKb.toLocaleString()} KB`} />
          <MetricCard label="Package Type" value="Custom upload" />
          <MetricCard label="Status" value="Ready for estimate" />
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

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-sm leading-6">{value || "-"}</p>
    </div>
  );
}

function MetricCard({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border bg-background px-4 py-3 ${className ?? ""}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-lg font-semibold tracking-tight">{value}</p>
    </div>
  );
}

function buildEstimateRows(
  payload: WizardPayload,
  dictionaries: WizardDictionaries,
): EstimateRow[] {
  const files = parsePreviewFiles(payload);
  const wordCount = files.reduce((sum, file) => sum + file.wordCount, 0);
  const baseTranslationFee = Math.max(900, Math.round(wordCount * 0.11));
  const sourceLanguage = labelFor(sourceLanguageOptions, payload.config.sourceLanguage);

  return payload.config.jurisdictionCodes.map((jurisdictionCode, index) => {
    const filingFee = 320 + index * 90;
    const officialFee = 180 + index * 120;
    const translationFee = Math.round(baseTranslationFee * (1 + index * 0.18));

    return {
      jurisdiction: labelFor(dictionaries.jurisdictions, jurisdictionCode),
      sourceLanguage,
      filingFee,
      officialFee,
      translationFee,
      total: filingFee + officialFee + translationFee,
    };
  });
}

function labelFor(
  options: Array<{ value: string; label: string }>,
  value?: string,
) {
  if (!value) {
    return "-";
  }

  return options.find((option) => option.value === value)?.label ?? value;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}
