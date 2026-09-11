import type { PmQuoteRevisionRow } from "./actions";

export type RevisionQuote = {
  id?: string;
  status?: string | null;
  notes?: string | null;
  currency?: string | null;
  breakdown_json?: unknown;
  pricing_snapshot?: unknown;
};

export function revisionRows(quote: RevisionQuote | null): PmQuoteRevisionRow[] {
  const snapshot = quote?.breakdown_json ?? quote?.pricing_snapshot;
  const response = snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)
    ? (snapshot as { response?: unknown }).response
    : null;
  if (!Array.isArray(response)) return [];
  const rows = response.flatMap((row) => parseRevisionRow(row));
  const revision = quoteRevision(quote);
  if (!revision) return rows;
  const discount = Number(revision.translationDiscountPercent);
  if (
    !Number.isFinite(discount)
    || discount <= 0
    || discount >= 100
    || revision?.translationDetailsAreBeforeDiscount === true
  ) {
    return rows;
  }
  return reconcileTranslationTotal(
    rows.map((row) => restoreRowTranslationBeforeDiscount(row, discount)),
    Number(revision.translationFeeBeforeDiscount),
  );
}

export function adjustedWordCount(
  quote: RevisionQuote | null,
  fallback: number,
  isEpGranting: boolean,
) {
  const revision = quoteRevision(quote);
  const amount = revision
    ? Number(isEpGranting ? revision.adjustedClaimWords : revision.adjustedDescriptionWords)
    : Number.NaN;
  return Number.isInteger(amount) && amount >= 0 ? amount : fallback;
}

export function translationDiscountPercent(quote: RevisionQuote | null) {
  const amount = Number(quoteRevision(quote)?.translationDiscountPercent);
  return Number.isFinite(amount) && amount >= 0 && amount <= 100 ? amount : 0;
}

export function translationFeeBeforeDiscount(quote: RevisionQuote | null) {
  const amount = Number(quoteRevision(quote)?.translationFeeBeforeDiscount);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

export function revisionTotals(
  rows: PmQuoteRevisionRow[],
  discountValue: string,
) {
  const officialFee = rows.reduce((sum, row) => sum + row.officialFee, 0);
  const serviceFee = rows.reduce((sum, row) => sum + row.serviceFee, 0);
  const rowTranslationFee = rows.reduce((sum, row) => sum + row.translationFee, 0);
  const discount = Math.min(100, Math.max(0, Number(discountValue) || 0));
  const translationBeforeDiscount = rowTranslationFee;
  const translationFee = roundMoney(translationBeforeDiscount * (1 - discount / 100));
  return {
    officialFee,
    serviceFee,
    translationBeforeDiscount,
    translationFee,
    discount,
    total: roundMoney(officialFee + serviceFee + translationFee),
  };
}

export function updateRevisionFee(
  rows: PmQuoteRevisionRow[],
  countryId: number,
  key: "officialFee" | "serviceFee" | "translationFee",
  value: string,
) {
  const parsed = Number(value);
  const amount = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  return rows.map((row) => row.countryId === countryId ? { ...row, [key]: amount } : row);
}

export function updateRevisionTranslationFee(
  rows: PmQuoteRevisionRow[],
  countryId: number,
  languageId: number,
  value: string,
) {
  const parsed = Number(value);
  const amount = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  return rows.map((row) => {
    if (row.countryId !== countryId) return row;
    const translationFeeDetails = row.translationFeeDetails.map((fee) => (
      fee.languageId === languageId ? { ...fee, amount } : fee
    ));
    return {
      ...row,
      translationFeeDetails,
      translationFee: roundMoney(translationFeeDetails.reduce((sum, fee) => sum + fee.amount, 0)),
    };
  });
}

function parseRevisionRow(row: unknown): PmQuoteRevisionRow[] {
  if (!row || typeof row !== "object" || Array.isArray(row)) return [];
  const value = row as Record<string, unknown>;
  const countryId = Number(value.countryId);
  const countryName = typeof value.countryName === "string" ? value.countryName : null;
  const officialFee = Number(value.officialFee);
  const serviceFee = Number(value.serviceFee);
  const translationFee = Number(value.translationFee);
  if (!Number.isInteger(countryId) || !countryName || ![officialFee, serviceFee, translationFee].every(Number.isFinite)) {
    return [];
  }
  const translationFeeDetails = parseTranslationFeeDetails(value.translationFeeDetails);
  return [{
    countryId,
    countryName,
    officialFee,
    serviceFee,
    translationFee: translationFeeDetails.length
      ? roundMoney(translationFeeDetails.reduce((sum, fee) => sum + fee.amount, 0))
      : translationFee,
    translationFeeDetails,
  }];
}

function parseTranslationFeeDetails(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((fee) => {
    if (!fee || typeof fee !== "object" || Array.isArray(fee)) return [];
    const item = fee as Record<string, unknown>;
    const languageId = Number(item.languageId);
    const languageName = typeof item.languageName === "string" ? item.languageName : null;
    const amount = Number(item.amount);
    return Number.isInteger(languageId) && languageName && Number.isFinite(amount)
      ? [{ languageId, languageName, amount }]
      : [];
  });
}

function quoteRevision(quote: RevisionQuote | null) {
  const snapshot = quote?.breakdown_json ?? quote?.pricing_snapshot;
  const revision = snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)
    ? (snapshot as { revision?: unknown }).revision
    : null;
  return revision && typeof revision === "object" && !Array.isArray(revision)
    ? revision as Record<string, unknown>
    : null;
}

function restoreRowTranslationBeforeDiscount(row: PmQuoteRevisionRow, discount: number) {
  const translationFeeDetails = row.translationFeeDetails.map((fee) => ({
    ...fee,
    amount: restoreDiscount(fee.amount, discount),
  }));
  return {
    ...row,
    translationFeeDetails,
    translationFee: translationFeeDetails.length
      ? roundMoney(translationFeeDetails.reduce((sum, fee) => sum + fee.amount, 0))
      : restoreDiscount(row.translationFee, discount),
  };
}

function restoreDiscount(value: number, discount: number) {
  return roundMoney(value / (1 - discount / 100));
}

function reconcileTranslationTotal(rows: PmQuoteRevisionRow[], expectedTotal: number) {
  if (!Number.isFinite(expectedTotal) || expectedTotal < 0 || !rows.length) return rows;
  const actualTotal = roundMoney(rows.reduce((sum, row) => sum + row.translationFee, 0));
  const adjustment = roundMoney(expectedTotal - actualTotal);
  if (!adjustment) return rows;
  const lastIndex = rows.length - 1;
  return rows.map((row, index) => {
    if (index !== lastIndex) return row;
    const details = [...row.translationFeeDetails];
    if (details.length) {
      const detailIndex = details.length - 1;
      details[detailIndex] = {
        ...details[detailIndex],
        amount: roundMoney(details[detailIndex].amount + adjustment),
      };
    }
    return {
      ...row,
      translationFeeDetails: details,
      translationFee: roundMoney(row.translationFee + adjustment),
    };
  });
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
