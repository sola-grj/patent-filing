"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ReceiptText } from "lucide-react";
import { Table } from "@radix-ui/themes";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { QuoteActions } from "@/features/requester/components/quote-actions";
import { QuoteDownloadMenu } from "@/features/requester/components/quote-download-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EpGrantingQuotation } from "./ep-granting-quotation";
import {
  isErpQuoteCurrencyCode,
  type ErpQuotePreview,
  type ErpQuoteRow,
} from "@/lib/eci-erp/types";

type SavedQuote = {
  id?: string;
  version_no?: number;
  status?: string | null;
  notes?: string | null;
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
  quotes,
  editAction,
  confirmation,
  showHeader = true,
  isEpGranting = false,
  translationRequired = true,
}: {
  quote?: SavedQuote | null;
  quotes?: SavedQuote[] | null;
  editAction?: ReactNode;
  confirmation?: { requestId: string; canConfirm: boolean };
  showHeader?: boolean;
  isEpGranting?: boolean;
  translationRequired?: boolean;
}) {
  const versions = useMemo(
    () => [...(quotes ?? (quote ? [quote] : []))].sort((left, right) => (right.version_no ?? 0) - (left.version_no ?? 0)),
    [quote, quotes],
  );
  const [selectedId, setSelectedId] = useState(quote?.id ?? versions[0]?.id ?? "");
  const selectedQuote = versions.find((item) => item.id === selectedId) ?? quote ?? versions[0];
  const currency = selectedQuote?.currency || "USD";
  const rows = savedRows(selectedQuote);
  const previousQuote = versions.find((item) => (item.version_no ?? 0) === (selectedQuote?.version_no ?? 0) - 1);
  const previousRows = new Map(savedRows(previousQuote).map((row) => [row.countryId, row]));
  const total = finiteAmount(selectedQuote?.total_amount) ?? rows.reduce((sum, row) => sum + row.total, 0);
  const officialFeeSubtotal = rows.reduce((sum, row) => sum + (row.officialFee ?? 0), 0);
  const serviceFeeSubtotal = rows.reduce((sum, row) => sum + (row.serviceFee ?? 0), 0);
  const translationFeeSubtotal = rows.reduce((sum, row) => sum + (row.translationFee ?? 0), 0);
  const translationFeeBeforeDiscount = revisionNumber(selectedQuote, "translationFeeBeforeDiscount");
  const translationDiscountPercent = revisionNumber(selectedQuote, "translationDiscountPercent");
  const adjustmentReason = revisionText(selectedQuote, "adjustmentNotes");
  const epGrantingQuote = isEpGranting ? savedErpQuote(selectedQuote) : null;
  const canConfirmSelectedQuote = Boolean(
    confirmation
    && selectedQuote?.id === versions[0]?.id
    && selectedQuote.status === "sent",
  );
  const versionSelector = versions.length > 1 ? (
    <div className="flex items-center gap-2 text-sm font-medium">
      <span>Version</span>
      <Select
        aria-label="Quotation version"
        value={selectedQuote?.id ?? ""}
        onValueChange={setSelectedId}
      >
        <SelectTrigger className="w-[150px]">
          <SelectValue placeholder="Select version" />
        </SelectTrigger>
        <SelectContent>
          {versions.map((item) => (
            <SelectItem key={item.id} value={item.id ?? ""}>
              v{item.version_no ?? "-"} · {item.status ?? "saved"}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  ) : null;

  if (epGrantingQuote) {
    return (
      <Card className="overflow-hidden">
        {showHeader ? <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0 border-b">
          <div>
            <CardTitle className="flex items-center gap-2"><ReceiptText className="size-5" />Quotation</CardTitle>
            <p className="mt-2 text-sm text-muted-foreground">Saved quote</p>
          </div>
          <div className="flex items-center gap-2">{versionSelector}<QuoteDownloadMenu quoteId={selectedQuote?.id} />{editAction}</div>
        </CardHeader> : versionSelector ? <CardHeader className="py-3">{versionSelector}</CardHeader> : null}
        <CardContent className="p-0">
          <EpGrantingQuotation
            estimate={epGrantingQuote}
            translationRequired={translationRequired}
            currency={epGrantingQuote.currency}
            readOnly
          />
          <QuoteConfirmationAction
            canConfirm={confirmation?.canConfirm ?? false}
            quoteId={selectedQuote?.id}
            requestId={confirmation?.requestId}
            visible={canConfirmSelectedQuote}
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
        <div className="flex items-center gap-2">{versionSelector}<QuoteDownloadMenu quoteId={selectedQuote?.id} />{editAction}</div>
      </CardHeader> : null}
      {!showHeader && versionSelector ? <CardHeader className="px-6 pt-6">{versionSelector}</CardHeader> : null}
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
                    <Table.Cell justify="end"><ChangedAmount value={row.officialFee} previous={previousRows.get(row.countryId)?.officialFee} /></Table.Cell>
                    <Table.Cell justify="end"><ChangedAmount value={row.serviceFee} previous={previousRows.get(row.countryId)?.serviceFee} /></Table.Cell>
                    <Table.Cell justify="end"><ChangedAmount value={row.translationFee} previous={previousRows.get(row.countryId)?.translationFee} /></Table.Cell>
                    <Table.Cell justify="end" className="font-semibold"><ChangedAmount value={row.total} previous={previousRows.get(row.countryId)?.total} /></Table.Cell>
                  </Table.Row>
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
                <QuoteSummaryLine label="Official Fee Subtotal" value={formatAmount(officialFeeSubtotal)} />
                <QuoteSummaryLine label="Service Fee Subtotal" value={formatAmount(serviceFeeSubtotal)} />
                <QuoteSummaryLine
                  label={<SubtotalLabel label="Translation Fee Subtotal" discountPercent={translationDiscountPercent} />}
                  value={translationFeeBeforeDiscount !== null && translationFeeBeforeDiscount !== translationFeeSubtotal ? (
                    <span className="flex items-center justify-end gap-2"><span className="text-muted-foreground line-through">{formatAmount(translationFeeBeforeDiscount)}</span>{formatAmount(translationFeeSubtotal)}</span>
                  ) : formatAmount(translationFeeSubtotal)}
                />
                <QuoteSummaryLine label="Quotation Total" value={formatCurrency(total, currency)} final />
              </div>
            </div>
          </div>
        ) : (
          <div className="py-10 text-sm text-muted-foreground">No saved quote rows are available for this request.</div>
        )}
        <QuoteConfirmationAction
          canConfirm={confirmation?.canConfirm ?? false}
          quoteId={selectedQuote?.id}
          requestId={confirmation?.requestId}
          visible={canConfirmSelectedQuote}
        />
      </CardContent>
    </Card>
  );
}

function QuoteConfirmationAction({
  canConfirm,
  quoteId,
  requestId,
  visible,
}: {
  canConfirm: boolean;
  quoteId?: string;
  requestId?: string;
  visible: boolean;
}) {
  if (!visible || !quoteId || !requestId) return null;
  return (
    <div className="mt-6 flex flex-col items-end border-t pt-5 text-right">
      <p className="text-sm text-muted-foreground">
        Your PM has sent this revised quotation. Confirm it before work can continue.
      </p>
      <div className="mt-4">
        {canConfirm ? (
          <QuoteActions requestId={requestId} quoteId={quoteId} />
        ) : (
          <p className="text-sm text-muted-foreground">Only the Request creator can confirm this quotation.</p>
        )}
      </div>
    </div>
  );
}

function QuoteSummaryLine({
  label,
  value,
  final = false,
}: {
  label: ReactNode;
  value: ReactNode;
  final?: boolean;
}) {
  return (
    <div className={final ? "flex items-center justify-between gap-6 pt-1 text-base" : "flex items-center justify-between gap-6"}>
      <span>{label}</span>
      <span className="whitespace-nowrap text-right">{value}</span>
    </div>
  );
}

function SubtotalLabel({ label, discountPercent }: { label: string; discountPercent: number | null }) {
  return (
    <span className="flex items-center gap-2">
      {label}
      {discountPercent !== null && discountPercent > 0 ? (
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-950">
          {formatDiscount(discountPercent)} discount
        </span>
      ) : null}
    </span>
  );
}

function ChangedAmount({ value, previous }: { value: number | null; previous?: number | null }) {
  const formatted = formatOptionalAmount(value);
  if (value === null || previous === undefined || previous === null || value === previous) return formatted;
  return (
    <TooltipProvider delayDuration={120}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-help rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-950">{formatted}</span>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={8}>
          Previous price: {formatAmount(previous)}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
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

function revisionNumber(quote: SavedQuote | undefined, key: "translationFeeBeforeDiscount" | "translationDiscountPercent") {
  const snapshot = asRecord(quote?.breakdown_json) ?? asRecord(quote?.pricing_snapshot);
  const revision = asRecord(snapshot?.revision);
  const value = Number(revision?.[key]);
  return Number.isFinite(value) ? value : null;
}

function formatDiscount(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value) + "%";
}

function revisionText(quote: SavedQuote | undefined, key: "adjustmentNotes") {
  const snapshot = asRecord(quote?.breakdown_json) ?? asRecord(quote?.pricing_snapshot);
  const revision = asRecord(snapshot?.revision);
  const value = revision?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
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
