import { sumMoney } from "./money.ts";
import type { ErpQuotePreview, ErpQuoteResult, ErpQuoteRow } from "./types.ts";

export type CountryFeeOverride = {
  countryId: number;
  officialFee?: number;
  serviceFee?: number;
};

export type QuoteRevisionInput = {
  countryOverrides: CountryFeeOverride[];
  translationDiscountPercent: number;
};

export type QuoteRevisionResult = {
  quote: ErpQuotePreview;
  discountAmount: number;
  translationFeeBeforeDiscount: number;
};

export function reviseErpQuote(
  base: ErpQuoteResult,
  input: QuoteRevisionInput,
): QuoteRevisionResult {
  const overrides = new Map(input.countryOverrides.map((item) => [item.countryId, item]));
  const discountRate = input.translationDiscountPercent / 100;
  const translationFeeBeforeDiscount = sumMoney(base.rows.map((row) => row.translationFee));
  const rows = base.rows.map((row) => reviseRow(row, overrides.get(row.countryId), discountRate));
  const total = sumMoney(rows.map((row) => row.total));
  const discountedTranslationFee = sumMoney(rows.map((row) => row.translationFee));

  return {
    quote: {
      ...base,
      rows,
      // RequestQuoteSheet reads `response` for persisted quotations. Keep the
      // fully resolved country rows there so a historical quote never depends
      // on a later ERP/dictionary response.
      response: rows,
      total,
    },
    translationFeeBeforeDiscount,
    discountAmount: sumMoney([translationFeeBeforeDiscount, -discountedTranslationFee]),
  };
}

function reviseRow(
  row: ErpQuoteRow,
  override: CountryFeeOverride | undefined,
  discountRate: number,
): ErpQuoteRow {
  const officialFee = override?.officialFee ?? row.officialFee;
  const serviceFee = override?.serviceFee ?? row.serviceFee;
  const translationFeeDetails = row.translationFeeDetails.map((fee) => ({
    ...fee,
    amount: roundMoney(fee.amount * (1 - discountRate)),
  }));
  const translationFee = sumMoney(translationFeeDetails.map((fee) => fee.amount));
  return {
    ...row,
    officialFee,
    serviceFee,
    translationFees: Object.fromEntries(
      translationFeeDetails.map((fee) => [String(fee.languageId), fee.amount]),
    ),
    translationFeeDetails,
    translationFee,
    total: sumMoney([officialFee, serviceFee, translationFee]),
  };
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
