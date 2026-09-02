"use client";

import type { ReactNode } from "react";
import { Table } from "@radix-ui/themes";

import {
  buildEpGrantingQuoteTable,
  type EpGrantingFeeLine,
} from "@/lib/eci-erp/ep-granting-quote";
import {
  erpQuoteCurrencySymbol,
  type ErpQuoteCurrencyCode,
  type ErpQuotePreview,
} from "@/lib/eci-erp/types";
import { QuoteCurrencySelect } from "./quote-currency-select";

export function EpGrantingQuotation({
  estimate,
  translationRequired,
  currency,
  onCurrencyChange,
  action,
  readOnly = false,
}: {
  estimate: ErpQuotePreview | null;
  translationRequired: boolean;
  currency: ErpQuoteCurrencyCode;
  onCurrencyChange?: (currency: ErpQuoteCurrencyCode) => void;
  action?: ReactNode;
  readOnly?: boolean;
}) {
  const table = estimate
    ? buildEpGrantingQuoteTable(estimate, translationRequired)
    : null;

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b px-6 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Fee Breakdown
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Base fees and target-language translation fees.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {!readOnly && onCurrencyChange ? (
              <QuoteCurrencySelect
                value={currency}
                onChange={onCurrencyChange}
              />
            ) : null}
            {action}
          </div>
        </div>
        {estimate && table ? (
          <QuotationTable table={table} currency={estimate.currency} />
        ) : (
          <div className="px-6 py-10 text-sm text-muted-foreground">
            No quotation is available for this configuration.
          </div>
        )}
      </section>
    </div>
  );
}

function QuotationTable({
  table,
  currency,
}: {
  table: ReturnType<typeof buildEpGrantingQuoteTable>;
  currency: ErpQuoteCurrencyCode;
}) {
  const showSubtotals = table.baseFees.length + table.translationFees.length > 1;
  return (
    <div className="overflow-x-auto px-6">
      <Table.Root size="2" variant="ghost" className="min-w-[760px] text-xs">
        <Table.Header>
          <Table.Row className="hover:bg-transparent">
            <Table.ColumnHeaderCell>Fee Category</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Fee Item</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Language / Scope</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Pricing Method</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell justify="end">
              Amount
            </Table.ColumnHeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {table.baseFees.map((line, index) => (
            <FeeRow key={`base-${index}`} line={line} />
          ))}
          {table.translationFees.map((line, index) => (
            <FeeRow key={`translation-${index}`} line={line} />
          ))}
          {showSubtotals ? (
            <>
              <SubtotalRow
                label="Base Fee Subtotal"
                amount={table.baseFeeSubtotal}
              />
              {table.translationFees.length ? (
                <SubtotalRow
                  label="Translation Fee Subtotal"
                  amount={table.translationFeeSubtotal}
                />
              ) : null}
            </>
          ) : null}
          <Table.Row className="font-semibold [--table-row-box-shadow:none]">
            <Table.Cell
              colSpan={4}
              className="py-3 text-right text-sm font-semibold"
            >
              Quotation Total
            </Table.Cell>
            <Table.Cell
              justify="end"
              className="whitespace-nowrap py-3 text-base font-semibold"
            >
              {erpQuoteCurrencySymbol(currency)}
              {formatAmount(table.total)}
            </Table.Cell>
          </Table.Row>
        </Table.Body>
      </Table.Root>
    </div>
  );
}

function FeeRow({ line }: { line: EpGrantingFeeLine }) {
  return (
    <Table.Row>
      <Table.RowHeaderCell className="font-medium">
        {line.category}
      </Table.RowHeaderCell>
      <Table.Cell>{line.item}</Table.Cell>
      <Table.Cell>{line.scope}</Table.Cell>
      <Table.Cell>{line.pricingMethod}</Table.Cell>
      <Table.Cell justify="end" className="whitespace-nowrap">
        {line.waived ? (
          <span className="mr-2 text-muted-foreground">Waived</span>
        ) : null}
        {formatAmount(line.amount)}
      </Table.Cell>
    </Table.Row>
  );
}

function SubtotalRow({
  label,
  amount,
}: {
  label: string;
  amount: number;
}) {
  return (
    <Table.Row className="font-semibold [--table-row-box-shadow:none]">
      <Table.Cell colSpan={4} className="text-right">
        {label}
      </Table.Cell>
      <Table.Cell justify="end" className="whitespace-nowrap">
        {formatAmount(amount)}
      </Table.Cell>
    </Table.Row>
  );
}

function formatAmount(value: number) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
