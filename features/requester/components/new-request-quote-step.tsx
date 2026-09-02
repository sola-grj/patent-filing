"use client";

import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { Table } from "@radix-ui/themes";

import type {
  WizardPatentAnalysisFile,
  WizardPayload,
  WizardUploadedFile,
} from "@/features/requester/wizard-types";
import {
  erpQuoteCurrencySymbol,
  type ErpQuoteCurrencyCode,
  type ErpQuotePreview,
} from "@/lib/eci-erp/types";
import { StepShell } from "./new-request-wizard-shared";
import { hasUsablePatentAnalysis } from "./new-request-wizard-utils";
import { EpGrantingQuotation } from "./ep-granting-quotation";
import { optServiceStatusForCountry } from "@/lib/eci-erp/opt-service-status";
import { PatentBasicInfo } from "./patent-basic-info";
import { QuoteCurrencySelect } from "./quote-currency-select";
import { getEpoServiceAvailability } from "@/features/requester/deadlines";

export function QuoteStepContent({
  payload,
  action,
  estimate,
  currency,
  onCurrencyChange,
}: {
  payload: WizardPayload;
  action?: ReactNode;
  estimate: ErpQuotePreview | null;
  currency: ErpQuoteCurrencyCode;
  onCurrencyChange: (currency: ErpQuoteCurrencyCode) => void;
}) {
  const analysisReady = hasUsablePatentAnalysis(payload);
  const isEpGranting = payload.config.epServiceType === "ep_granting";
  const showTranslationFee = payload.config.translationRequired;
  const showSubtotals = (estimate?.rows.length ?? 0) > 1;
  const summaryColSpan = showTranslationFee ? 4 : 3;
  const deadline = payload.selectedPatent && payload.config.epServiceType
    ? getEpoServiceAvailability(
        payload.config.epServiceType,
        payload.selectedPatent,
        payload.analysis,
      ).deadline
    : undefined;
  const feeTotals = estimate ? summarizeFeeTotals(estimate) : null;
  return (
    <StepShell
      title={isEpGranting ? "European Patent Granting Quotation" : "Estimate Sheet"}
      description={isEpGranting
        ? "Review the quotation before submitting the request."
        : "Review the estimate generated from the selected source package."}
    >
      <div className="flex h-full min-h-0 flex-col gap-5 overflow-y-auto pr-1">
        {payload.selectedPatent ? (
          <PatentBasicInfo
            patent={payload.selectedPatent}
            heading="Patent Details"
            additionalFields={isEpGranting
              ? [{
                  label: "Rule 71(3) Dispatch Date",
                  value: formatPatentDate(payload.selectedPatent.rule713CommunicationDate),
                }, {
                  label: "Legal Deadline",
                  value: formatPatentDate(deadline),
                }]
              : [{
                  label: "Grant Date",
                  value: formatPatentDate(payload.selectedPatent.grantPublicationDate),
                }, {
                  label: "Legal Deadline",
                  value: formatPatentDate(deadline),
                }]}
          />
        ) : null}
        {payload.sourceMode === "upload" ? (
          <UploadOverviewCard
            files={payload.uploadedFiles}
            analysisFiles={payload.analysis?.files ?? []}
          />
        ) : null}
        {isEpGranting ? (
          <EpGrantingQuotation
            estimate={estimate}
            translationRequired={payload.config.translationRequired}
            currency={currency}
            onCurrencyChange={onCurrencyChange}
            action={action}
          />
        ) : (
          <>
            <section className="rounded-2xl border bg-card">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b px-6 py-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Fee Breakdown
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {analysisReady
                  ? "Live estimate for the current request configuration."
                  : "Word counts and estimate details will appear when patent processing completes."}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <QuoteCurrencySelect
                value={currency}
                onChange={onCurrencyChange}
              />
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
                    {showTranslationFee ? (
                      <Table.ColumnHeaderCell justify="end">Translation Fee</Table.ColumnHeaderCell>
                    ) : null}
                    <Table.ColumnHeaderCell justify="end">Total</Table.ColumnHeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {estimate.rows.map((row) => {
                    const serviceStatus = optServiceStatusForCountry(
                      payload.config.serviceItem || undefined,
                      row.countryId,
                      payload.config.optOutCountryIds,
                    );
                    return (
                      <Table.Row key={row.countryId}>
                        <Table.RowHeaderCell className="font-medium">
                          <span>{row.countryName}</span>
                          {serviceStatus ? (
                            <span className="ml-2 whitespace-nowrap rounded-full border border-brand-border bg-brand/10 px-2 py-0.5 text-[10px] font-semibold text-brand">
                              {serviceStatus}
                            </span>
                          ) : null}
                        </Table.RowHeaderCell>
                        <Table.Cell className="whitespace-nowrap" justify="end">
                          {formatAmount(row.officialFee)}
                        </Table.Cell>
                        <Table.Cell className="whitespace-nowrap" justify="end">
                          {formatAmount(row.serviceFee)}
                        </Table.Cell>
                        {showTranslationFee ? (
                          <Table.Cell className="whitespace-nowrap" justify="end">
                            {formatAmount(row.translationFee)}
                          </Table.Cell>
                        ) : null}
                        <Table.Cell justify="end" className="whitespace-nowrap font-semibold">
                          {formatAmount(row.total)}
                        </Table.Cell>
                      </Table.Row>
                    );
                  })}
                  {showSubtotals ? (
                    <>
                      <QuoteSubtotalRow
                        label="Official Fee Subtotal"
                        amount={feeTotals!.officialFee}
                        currency={estimate.currency}
                        colSpan={summaryColSpan}
                      />
                      <QuoteSubtotalRow
                        label="Service Fee Subtotal"
                        amount={feeTotals!.serviceFee}
                        currency={estimate.currency}
                        colSpan={summaryColSpan}
                      />
                      {showTranslationFee ? (
                        <QuoteSubtotalRow
                          label="Translation Fee Subtotal"
                          amount={feeTotals!.translationFee}
                          currency={estimate.currency}
                          colSpan={summaryColSpan}
                        />
                      ) : null}
                    </>
                  ) : null}
                  <Table.Row className="bg-muted/20 [--table-row-box-shadow:none]">
                    <Table.Cell
                      colSpan={summaryColSpan}
                      justify="end"
                      className="text-sm font-semibold"
                    >
                      Estimated Total
                    </Table.Cell>
                    <Table.Cell justify="end" className="text-base font-semibold">
                      {erpQuoteCurrencySymbol(estimate.currency)}{formatAmount(estimate.total)}
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
          </>
        )}
      </div>
    </StepShell>
  );
}

function QuoteSubtotalRow({ label, amount, currency, colSpan }: {
  label: string;
  amount: number;
  currency: ErpQuoteCurrencyCode;
  colSpan: number;
}) {
  return (
    <Table.Row className="[--table-row-box-shadow:none]">
      <Table.Cell colSpan={colSpan} justify="end" className="text-sm font-semibold text-muted-foreground">
        {label}
      </Table.Cell>
      <Table.Cell justify="end" className="whitespace-nowrap text-sm font-semibold">
        {erpQuoteCurrencySymbol(currency)}{formatAmount(amount)}
      </Table.Cell>
    </Table.Row>
  );
}

function summarizeFeeTotals(estimate: ErpQuotePreview) {
  return estimate.rows.reduce((totals, row) => ({
    officialFee: totals.officialFee + row.officialFee,
    serviceFee: totals.serviceFee + row.serviceFee,
    translationFee: totals.translationFee + row.translationFee,
  }), { officialFee: 0, serviceFee: 0, translationFee: 0 });
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

function formatAmount(value: number) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatPatentDate(value?: string) {
  if (!value) return "-";
  if (/^\d{8}$/.test(value)) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString().slice(0, 10);
}
