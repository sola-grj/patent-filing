import { Pencil, ReceiptText } from "lucide-react";
import { Table } from "@radix-ui/themes";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EpGrantingQuotation } from "./ep-granting-quotation";
import {
  isErpQuoteCurrencyCode,
  type ErpQuotePreview,
  type ErpQuoteRow,
} from "@/lib/eci-erp/types";

type SavedQuote = {
  currency?: string | null;
  total_amount?: number | string | null;
  breakdown_json?: unknown;
  pricing_snapshot?: unknown;
  quote_items?: Array<{ label: string; amount: number | string }> | null;
};

type SavedErpRow = {
  countryId?: number;
  countryName: string;
  officialFee: number | null;
  serviceFee: number | null;
  translationFee: number | null;
  total: number;
};

export function RequestQuoteSheet({
  quote,
  showEditAction = false,
  showHeader = true,
  isEpGranting = false,
  translationRequired = true,
}: {
  quote?: SavedQuote | null;
  showEditAction?: boolean;
  showHeader?: boolean;
  isEpGranting?: boolean;
  translationRequired?: boolean;
}) {
  const currency = quote?.currency || "USD";
  const rows = savedRows(quote);
  const total = finiteAmount(quote?.total_amount) ?? rows.reduce((sum, row) => sum + row.total, 0);
  const officialFeeSubtotal = rows.reduce((sum, row) => sum + (row.officialFee ?? 0), 0);
  const serviceFeeSubtotal = rows.reduce((sum, row) => sum + (row.serviceFee ?? 0), 0);
  const translationFeeSubtotal = rows.reduce((sum, row) => sum + (row.translationFee ?? 0), 0);
  const epGrantingQuote = isEpGranting ? savedErpQuote(quote) : null;

  if (epGrantingQuote) {
    return (
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <EpGrantingQuotation
            estimate={epGrantingQuote}
            translationRequired={translationRequired}
            currency={epGrantingQuote.currency}
            readOnly
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      {showHeader ? <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0 border-b">
        <div>
          <CardTitle className="flex items-center gap-2"><ReceiptText className="size-5" />Quotation</CardTitle>
          <p className="mt-2 text-sm text-muted-foreground">Saved quote</p>
        </div>
        {showEditAction ? (
          <Button type="button" variant="ghost" size="icon" disabled aria-label="Edit quotation amounts" title="Quotation amounts are read-only">
            <Pencil className="h-4 w-4" />
          </Button>
        ) : null}
      </CardHeader> : null}
      <CardContent className={showHeader ? "px-6 pb-6 pt-0" : "p-6"}>
        {rows.length ? (
          <div className="overflow-x-auto">
            <Table.Root size="2" variant="ghost" layout="fixed" className="min-w-[680px] table-fixed text-xs">
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
                {rows.map((row, index) => (
                  <Table.Row key={row.countryId ?? `${row.countryName}-${index}`}>
                    <Table.RowHeaderCell className="font-medium">{row.countryName}</Table.RowHeaderCell>
                    <Table.Cell justify="end">{formatOptionalAmount(row.officialFee)}</Table.Cell>
                    <Table.Cell justify="end">{formatOptionalAmount(row.serviceFee)}</Table.Cell>
                    <Table.Cell justify="end">{formatOptionalAmount(row.translationFee)}</Table.Cell>
                    <Table.Cell justify="end" className="font-semibold">{formatAmount(row.total)}</Table.Cell>
                  </Table.Row>
                ))}
                <QuoteSummaryRow label="Official Fee Subtotal" value={formatAmount(officialFeeSubtotal)} />
                <QuoteSummaryRow label="Service Fee Subtotal" value={formatAmount(serviceFeeSubtotal)} />
                <QuoteSummaryRow label="Translation Fee Subtotal" value={formatAmount(translationFeeSubtotal)} />
                <QuoteSummaryRow
                  label="Quotation Total"
                  value={formatCurrency(total, currency)}
                  final
                />
              </Table.Body>
            </Table.Root>
          </div>
        ) : (
          <div className="py-10 text-sm text-muted-foreground">No saved quote rows are available for this request.</div>
        )}
      </CardContent>
    </Card>
  );
}

function QuoteSummaryRow({
  label,
  value,
  final = false,
}: {
  label: string;
  value: string;
  final?: boolean;
}) {
  return (
    <Table.Row className="font-semibold [--table-row-box-shadow:none]">
      <Table.Cell colSpan={4} justify="end" className="py-3 text-sm">
        {label}
      </Table.Cell>
      <Table.Cell justify="end" className={final ? "whitespace-nowrap py-3 text-base" : "whitespace-nowrap py-3 text-sm"}>
        {value}
      </Table.Cell>
    </Table.Row>
  );
}

function savedErpQuote(quote?: SavedQuote | null): ErpQuotePreview | null {
  const currency = quote?.currency;
  const snapshot = asRecord(quote?.breakdown_json) ?? asRecord(quote?.pricing_snapshot);
  const response = Array.isArray(snapshot?.response) ? snapshot.response : null;
  if (!isErpQuoteCurrencyCode(currency) || !response?.length) return null;
  const rows = response.flatMap(savedErpRow);
  if (!rows.length) return null;
  return {
    source: "eci_erp",
    currency,
    quotedAt: typeof snapshot?.quotedAt === "string" ? snapshot.quotedAt : "",
    customerName: typeof snapshot?.customerName === "string" ? snapshot.customerName : "",
    validUntil: typeof snapshot?.validUntil === "string" ? snapshot.validUntil : undefined,
    rows,
    total: finiteAmount(quote?.total_amount) ?? rows.reduce((sum, row) => sum + row.total, 0),
  };
}

function savedErpRow(value: unknown): ErpQuoteRow[] {
  const row = asRecord(value);
  const countryId = finiteAmount(row?.countryId);
  const countryName = typeof row?.countryName === "string" ? row.countryName : null;
  const officialFee = finiteAmount(row?.officialFee);
  const serviceFee = finiteAmount(row?.serviceFee);
  const translationFee = finiteAmount(row?.translationFee);
  const total = finiteAmount(row?.total);
  const translationFeeDetails = Array.isArray(row?.translationFeeDetails)
    ? row.translationFeeDetails.flatMap((fee) => {
        const detail = asRecord(fee);
        const languageId = finiteAmount(detail?.languageId);
        const languageName = typeof detail?.languageName === "string" ? detail.languageName : null;
        const amount = finiteAmount(detail?.amount);
        return languageId === null || !languageName || amount === null
          ? []
          : [{ languageId, languageName, amount }];
      })
    : [];
  if (
    countryId === null
    || !countryName
    || officialFee === null
    || serviceFee === null
    || translationFee === null
    || total === null
  ) return [];
  return [{
    countryId,
    countryName,
    officialFee,
    serviceFee,
    translationFees: {},
    translationFee,
    translationFeeDetails,
    total,
  }];
}

function savedRows(quote?: SavedQuote | null): SavedErpRow[] {
  const snapshot = asRecord(quote?.breakdown_json) ?? asRecord(quote?.pricing_snapshot);
  const response = Array.isArray(snapshot?.response) ? snapshot.response : null;
  if (response) {
    return response.flatMap((value) => {
      const row = asRecord(value);
      if (!row) return [];
      const countryName = typeof row?.countryName === "string" ? row.countryName : null;
      const total = finiteAmount(row?.total);
      if (!countryName || total === null) return [];
      return [{
        countryId: finiteAmount(row.countryId) ?? undefined,
        countryName,
        officialFee: finiteAmount(row.officialFee),
        serviceFee: finiteAmount(row.serviceFee),
        translationFee: finiteAmount(row.translationFee),
        total,
      }];
    });
  }
  return (quote?.quote_items ?? []).flatMap((item) => {
    const amount = finiteAmount(item.amount);
    return amount === null ? [] : [{
      countryName: item.label,
      officialFee: null,
      serviceFee: null,
      translationFee: null,
      total: amount,
    }];
  });
}

function finiteAmount(value: unknown) {
  const amount = typeof value === "number" || typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function formatCurrency(value: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatOptionalAmount(value: number | null) {
  return value === null ? "-" : formatAmount(value);
}

function formatAmount(value: number) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
