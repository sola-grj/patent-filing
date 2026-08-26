import type { ErpQuotePreview } from "./types";
import { sumMoney } from "./money.ts";

export type EpGrantingFeeLine = {
  category: "Base Fee" | "Translation Fee";
  item: string;
  scope: string;
  pricingMethod: string;
  amount: number;
  waived: boolean;
};

export type EpGrantingQuoteTable = {
  baseFees: EpGrantingFeeLine[];
  translationFees: EpGrantingFeeLine[];
  baseFeeSubtotal: number;
  translationFeeSubtotal: number;
  total: number;
};

export function buildEpGrantingQuoteTable(
  quote: ErpQuotePreview,
  translationRequired: boolean,
): EpGrantingQuoteTable {
  const baseFees = quote.rows.flatMap((row) => [
    feeLine("Professional Service Fee", "EP Granting", "Fixed Fee", row.serviceFee),
    feeLine("EPO Official Fee", "European Patent Office", "Disbursement", row.officialFee),
  ]);
  const translationFees = translationRequired
    ? quote.rows.flatMap((row) => row.translationFeeDetails.map((fee) => ({
        category: "Translation Fee" as const,
        item: "Claims Translation",
        scope: shortLanguageName(fee.languageName),
        pricingMethod: "Per Language",
        amount: fee.amount,
        waived: fee.amount === 0,
      })))
    : [];
  const baseFeeSubtotal = sumAmounts(baseFees);
  const translationFeeSubtotal = sumAmounts(translationFees);

  return {
    baseFees,
    translationFees,
    baseFeeSubtotal,
    translationFeeSubtotal,
    total: sumMoney([baseFeeSubtotal, translationFeeSubtotal]),
  };
}

export function quoteValidUntilTimestamp(validUntil?: string, nowMs = Date.now()) {
  if (!validUntil) return new Date(nowMs + 7 * 86400000).toISOString();
  return `${validUntil}T23:59:59.999+08:00`;
}

function feeLine(item: string, scope: string, pricingMethod: string, amount: number) {
  return {
    category: "Base Fee" as const,
    item,
    scope,
    pricingMethod,
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
