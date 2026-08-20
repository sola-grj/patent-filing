import { Pencil, ReceiptText } from "lucide-react";
import { Table } from "@radix-ui/themes";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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

export function RequestQuoteSheet({ quote, showEditAction = false }: {
  quote?: SavedQuote | null;
  showEditAction?: boolean;
}) {
  const currency = quote?.currency || "EUR";
  const rows = savedRows(quote);
  const total = finiteAmount(quote?.total_amount) ?? rows.reduce((sum, row) => sum + row.total, 0);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0 border-b">
        <div>
          <CardTitle className="flex items-center gap-2"><ReceiptText className="size-5" />Quotation</CardTitle>
          <p className="mt-2 text-sm text-muted-foreground">Saved ECI ERP quote · {formatCurrency(total, currency)}</p>
        </div>
        {showEditAction ? (
          <Button type="button" variant="ghost" size="icon" disabled aria-label="Edit quotation amounts" title="ERP quotation amounts are read-only">
            <Pencil className="h-4 w-4" />
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="px-6 pb-6 pt-0">
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
                    <Table.Cell justify="end">{formatOptionalCurrency(row.officialFee, currency)}</Table.Cell>
                    <Table.Cell justify="end">{formatOptionalCurrency(row.serviceFee, currency)}</Table.Cell>
                    <Table.Cell justify="end">{formatOptionalCurrency(row.translationFee, currency)}</Table.Cell>
                    <Table.Cell justify="end" className="font-semibold">{formatCurrency(row.total, currency)}</Table.Cell>
                  </Table.Row>
                ))}
                <Table.Row className="bg-muted/20 [--table-row-box-shadow:none]">
                  <Table.Cell colSpan={4} justify="end" className="text-sm font-semibold">Estimated Total</Table.Cell>
                  <Table.Cell justify="end" className="text-base font-semibold">{formatCurrency(total, currency)}</Table.Cell>
                </Table.Row>
              </Table.Body>
            </Table.Root>
          </div>
        ) : (
          <div className="py-10 text-sm text-muted-foreground">No saved ERP quote rows are available for this request.</div>
        )}
      </CardContent>
    </Card>
  );
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

function formatOptionalCurrency(value: number | null, currency: string) {
  return value === null ? "-" : formatCurrency(value, currency);
}
