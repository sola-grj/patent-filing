import { sumMoney } from "./money.ts";
import type { ErpQuotePreview, ErpQuoteResult, ErpQuoteRow } from "./types.ts";

export type CountryFeeOverride = {
  countryId: number;
  officialFee?: number;
  serviceFee?: number;
  translationFee?: number;
  translationFees?: Record<number, number>;
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
  const translationFeeBeforeDiscount = sumMoney(base.rows.map((row) => {
    const override = overrides.get(row.countryId);
    return override?.translationFees
      ? sumMoney(row.translationFeeDetails.map((fee) => override.translationFees?.[fee.languageId] ?? fee.amount))
      : override?.translationFee ?? row.translationFee;
  }));
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
  const translationFeeDetails = withTranslationFeeOverride(
    row.translationFeeDetails,
    override?.translationFee,
    override?.translationFees,
  ).map((fee) => ({
    ...fee,
    amount: roundMoney(fee.amount * (1 - discountRate)),
  }));
  const translationFee = override?.translationFee !== undefined && !translationFeeDetails.length
    ? roundMoney(override.translationFee * (1 - discountRate))
    : sumMoney(translationFeeDetails.map((fee) => fee.amount));
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

function withTranslationFeeOverride(
  fees: ErpQuoteRow["translationFeeDetails"],
  translationFee: number | undefined,
  translationFees: Record<number, number> | undefined,
) {
  if (translationFees) {
    return fees.map((fee) => ({
      ...fee,
      amount: translationFees[fee.languageId] ?? fee.amount,
    }));
  }
  if (translationFee === undefined || !fees.length) return fees;
  const originalTotal = sumMoney(fees.map((fee) => fee.amount));
  if (originalTotal <= 0) {
    return fees.map((fee, index) => ({ ...fee, amount: index === 0 ? translationFee : 0 }));
  }
  let remaining = translationFee;
  return fees.map((fee, index) => {
    const amount = index === fees.length - 1
      ? remaining
      : roundMoney(translationFee * fee.amount / originalTotal);
    remaining = roundMoney(remaining - amount);
    return { ...fee, amount };
  });
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
