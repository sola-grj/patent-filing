import type { ErpQuotePreview } from "./types";
import { sumMoney } from "./money.ts";

export type EpGrantingFeeLine = {
  kind: "official" | "service" | "translation";
  feeCategory: string;
  unit: "Per Item" | "Per Word";
  amount: number;
  waived: boolean;
};

export type EpGrantingQuoteTable = {
  officialFees: EpGrantingFeeLine[];
  serviceFees: EpGrantingFeeLine[];
  translationFees: EpGrantingFeeLine[];
  officialFeeSubtotal: number;
  serviceFeeSubtotal: number;
  translationFeeSubtotal: number;
  total: number;
};

export function buildEpGrantingQuoteTable(
  quote: ErpQuotePreview,
  translationRequired: boolean,
): EpGrantingQuoteTable {
  const officialFees = quote.rows.map((row) =>
    feeLine("official", "EPO Official Fee", "Per Item", row.officialFee),
  );
  const serviceFees = quote.rows.map((row) =>
    feeLine("service", "Professional Service Fee", "Per Item", row.serviceFee),
  );
  const translationFees = translationRequired
    ? quote.rows.flatMap((row) => row.translationFeeDetails.map((fee) => ({
        kind: "translation" as const,
        feeCategory: shortLanguageName(fee.languageName),
        unit: "Per Word" as const,
        amount: fee.amount,
        waived: fee.amount === 0,
      })))
    : [];
  const officialFeeSubtotal = sumAmounts(officialFees);
  const serviceFeeSubtotal = sumAmounts(serviceFees);
  const translationFeeSubtotal = translationRequired
    ? sumMoney(quote.rows.map((row) => row.translationFee))
    : 0;

  return {
    officialFees,
    serviceFees,
    translationFees,
    officialFeeSubtotal,
    serviceFeeSubtotal,
    translationFeeSubtotal,
    total: translationRequired
      ? quote.total
      : sumMoney([officialFeeSubtotal, serviceFeeSubtotal]),
  };
}

export function quoteValidUntilTimestamp(validUntil?: string, nowMs = Date.now()) {
  if (!validUntil) return new Date(nowMs + 7 * 86400000).toISOString();
  return `${validUntil}T23:59:59.999+08:00`;
}

function feeLine(
  kind: "official" | "service",
  feeCategory: string,
  unit: "Per Item",
  amount: number,
) {
  return {
    kind,
    feeCategory,
    unit,
    amount,
    waived: false,
  };
}

function shortLanguageName(value: string) {
  return value.replace(/\s*\([^)]*\)\s*$/, "").trim() || value;
}

function sumAmounts(lines: EpGrantingFeeLine[]) {
  return sumMoney(lines.map((line) => line.amount));
}
