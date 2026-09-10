import assert from "node:assert/strict";
import test from "node:test";

import { reviseErpQuote } from "./quote-revision.ts";

test("applies country overrides before a translation-only percentage discount", () => {
  const result = reviseErpQuote({
    source: "eci_erp",
    currency: "USD",
    quotedAt: "2026-09-03T00:00:00.000Z",
    customerName: "Customer",
    request: { categoryId: 82, isTranslate: 1, patFilingRouteId: 1, patFilingTypeId: 1, clientId: 7, priceCurrencyId: 2 },
    response: [],
    total: 330,
    rows: [
      { countryId: 1, countryName: "France", officialFee: 100, serviceFee: 50, translationFees: { "15": 30 }, translationFeeDetails: [{ languageId: 15, languageName: "French", amount: 30 }], translationFee: 30, total: 180 },
      { countryId: 2, countryName: "Germany", officialFee: 70, serviceFee: 40, translationFees: { "17": 40 }, translationFeeDetails: [{ languageId: 17, languageName: "German", amount: 40 }], translationFee: 40, total: 150 },
    ],
  }, {
    countryOverrides: [{ countryId: 1, officialFee: 120 }, { countryId: 2, serviceFee: 45 }],
    translationDiscountPercent: 10,
  });

  assert.equal(result.quote.rows[0].officialFee, 120);
  assert.equal(result.quote.rows[1].serviceFee, 45);
  assert.equal(result.quote.rows[0].translationFee, 27);
  assert.equal(result.quote.rows[1].translationFee, 36);
  assert.equal(result.translationFeeBeforeDiscount, 70);
  assert.equal(result.discountAmount, 7);
  assert.equal(result.quote.total, 348);
});

test("allows a PM to override the pre-discount translate fee", () => {
  const result = reviseErpQuote({
    source: "eci_erp",
    currency: "USD",
    quotedAt: "2026-09-03T00:00:00.000Z",
    customerName: "Customer",
    request: { categoryId: 82, isTranslate: 1, patFilingRouteId: 1, patFilingTypeId: 1, clientId: 7, priceCurrencyId: 2 },
    response: [],
    total: 180,
    rows: [{ countryId: 1, countryName: "France", officialFee: 100, serviceFee: 50, translationFees: { "15": 30 }, translationFeeDetails: [{ languageId: 15, languageName: "French", amount: 30 }], translationFee: 30, total: 180 }],
  }, {
    countryOverrides: [{ countryId: 1, translationFee: 80 }],
    translationDiscountPercent: 10,
  });

  assert.equal(result.quote.rows[0].translationFee, 72);
  assert.equal(result.quote.rows[0].translationFeeDetails[0].amount, 72);
  assert.equal(result.translationFeeBeforeDiscount, 80);
  assert.equal(result.quote.total, 222);
});

test("allows EP Granting translation fees to be revised per language", () => {
  const result = reviseErpQuote({
    source: "eci_erp",
    currency: "USD",
    quotedAt: "2026-09-10T00:00:00.000Z",
    customerName: "Customer",
    request: { categoryId: 84, isTranslate: 1, patFilingRouteId: 1, patFilingTypeId: 1, clientId: 7, priceCurrencyId: 2, patClaimWords: 500 },
    response: [],
    total: 315.54,
    rows: [{
      countryId: 1001,
      countryName: "Europe",
      officialFee: 63.78,
      serviceFee: 1.16,
      translationFees: { "15": 136.69, "17": 113.91 },
      translationFeeDetails: [
        { languageId: 15, languageName: "French (France)", amount: 136.69 },
        { languageId: 17, languageName: "German (Germany)", amount: 113.91 },
      ],
      translationFee: 250.6,
      total: 315.54,
    }],
  }, {
    countryOverrides: [{ countryId: 1001, translationFees: { 15: 140, 17: 120 } }],
    translationDiscountPercent: 10,
  });

  assert.deepEqual(result.quote.rows[0].translationFeeDetails.map((fee) => fee.amount), [126, 108]);
  assert.equal(result.translationFeeBeforeDiscount, 260);
  assert.equal(result.quote.rows[0].translationFee, 234);
  assert.equal(result.quote.total, 298.94);
});
