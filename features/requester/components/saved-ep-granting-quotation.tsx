"use client";

import type { ReactNode } from "react";
import { Table } from "@radix-ui/themes";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  buildEpGrantingQuoteTable,
  type EpGrantingFeeLine,
} from "@/lib/eci-erp/ep-granting-quote";
import {
  erpQuoteCurrencySymbol,
  type ErpQuotePreview,
} from "@/lib/eci-erp/types";

export function SavedEpGrantingQuotation({
  estimate,
  previousEstimate,
  translationRequired,
  adjustmentReason,
  translationDiscountPercent,
  translationFeeBeforeDiscount,
}: {
  estimate: ErpQuotePreview;
  previousEstimate: ErpQuotePreview | null;
  translationRequired: boolean;
  adjustmentReason: string | null;
  translationDiscountPercent: number | null;
  translationFeeBeforeDiscount: number | null;
}) {
  const table = buildEpGrantingQuoteTable(estimate, translationRequired);
  const previousTable = previousEstimate
    ? buildEpGrantingQuoteTable(previousEstimate, translationRequired)
    : null;
  const previousFees = new Map(
    [
      ...(previousTable?.officialFees ?? []),
      ...(previousTable?.serviceFees ?? []),
      ...(previousTable?.translationFees ?? []),
    ]
      .map((line) => [feeLineKey(line), line.amount]),
  );

  return (
    <div className="overflow-x-auto">
      <Table.Root size="2" variant="ghost" layout="fixed" className="min-w-[760px] table-fixed text-xs">
        <Table.Header>
          <Table.Row className="hover:bg-transparent">
            <Table.ColumnHeaderCell>Fee Category</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Unit</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell justify="end">Amount</Table.ColumnHeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {[
            ...table.officialFees,
            ...table.serviceFees,
            ...table.translationFees,
          ].map((line) => (
            <FeeRow
              key={feeLineKey(line)}
              line={line}
              previousAmount={previousFees.get(feeLineKey(line))}
            />
          ))}
        </Table.Body>
      </Table.Root>
      <div className="grid gap-6 border-t pt-5 md:grid-cols-[minmax(0,1fr)_minmax(19rem,auto)] md:items-end">
        {adjustmentReason ? (
          <section className="max-w-3xl rounded-md border border-border bg-muted/30 px-4 py-3" aria-label="Adjustment reason">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Adjustment reason</p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground">{adjustmentReason}</p>
          </section>
        ) : null}
        <div className="space-y-3 text-sm font-semibold md:col-start-2 md:min-w-80">
          <SummaryLine label="Official Fee Subtotal" value={`${erpQuoteCurrencySymbol(estimate.currency)}${formatAmount(table.officialFeeSubtotal)}`} />
          <SummaryLine label="Service Fee Subtotal" value={`${erpQuoteCurrencySymbol(estimate.currency)}${formatAmount(table.serviceFeeSubtotal)}`} />
          {table.translationFees.length ? (
            <SummaryLine
              label={<SubtotalLabel discountPercent={translationDiscountPercent} />}
              value={translationFeeBeforeDiscount !== null && translationFeeBeforeDiscount !== table.translationFeeSubtotal ? (
                <span className="flex items-center justify-end gap-2">
                  <span className="text-muted-foreground line-through">{erpQuoteCurrencySymbol(estimate.currency)}{formatAmount(translationFeeBeforeDiscount)}</span>
                  {erpQuoteCurrencySymbol(estimate.currency)}{formatAmount(table.translationFeeSubtotal)}
                </span>
              ) : `${erpQuoteCurrencySymbol(estimate.currency)}${formatAmount(table.translationFeeSubtotal)}`}
            />
          ) : null}
          <SummaryLine
            label="Quotation Total"
            value={`${erpQuoteCurrencySymbol(estimate.currency)}${formatAmount(table.total)}`}
            final
          />
        </div>
      </div>
    </div>
  );
}

function FeeRow({ line, previousAmount }: { line: EpGrantingFeeLine; previousAmount?: number }) {
  return (
    <Table.Row>
      <Table.RowHeaderCell className="font-medium">{line.feeCategory}</Table.RowHeaderCell>
      <Table.Cell>{line.unit}</Table.Cell>
      <Table.Cell justify="end" className="whitespace-nowrap">
        {line.waived ? <span className="mr-2 text-muted-foreground">Waived</span> : null}
        <ChangedAmount value={line.amount} previous={previousAmount} />
      </Table.Cell>
    </Table.Row>
  );
}

function ChangedAmount({ value, previous }: { value: number; previous?: number }) {
  const formatted = formatAmount(value);
  if (previous === undefined || value === previous) return formatted;
  return (
    <TooltipProvider delayDuration={120}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-help rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-950">{formatted}</span>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={8}>Previous price: {formatAmount(previous)}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function SummaryLine({ label, value, final = false }: { label: ReactNode; value: ReactNode; final?: boolean }) {
  return (
    <div className={final ? "flex items-center justify-between gap-6 pt-1 text-base" : "flex items-center justify-between gap-6"}>
      <span>{label}</span>
      <span className="whitespace-nowrap text-right">{value}</span>
    </div>
  );
}

function SubtotalLabel({ discountPercent }: { discountPercent: number | null }) {
  return (
    <span className="flex items-center gap-2">
      Translation Fee Subtotal
      {discountPercent !== null && discountPercent > 0 ? (
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-950">
          {formatDiscount(discountPercent)} discount
        </span>
      ) : null}
    </span>
  );
}

function feeLineKey(line: EpGrantingFeeLine) {
  return [line.kind, line.feeCategory, line.unit].join("\u0000");
}

function formatDiscount(value: number) {
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value)}%`;
}

function formatAmount(value: number) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
