import assert from "node:assert/strict";
import test from "node:test";

import {
  applyTranslationSelection,
  buildErpPriceRequest,
  categoryForConfig,
  normalizeLogin,
  priceTotal,
  quoteAvailabilityError,
  stableAuthUserId,
  validatePriceRows,
  verifiedClaimMetrics,
} from "./pricing-rules.ts";
import {
  shouldRetryAuthentication,
  tokenFromPayload,
  tokenIsReusable,
  tokenLifetimeMsFromPayload,
} from "./token-policy.ts";
import { erpQuoteCurrency } from "./types.ts";
import type { ErpPriceRow } from "./types.ts";
import { divideMoney, multiplyMoney, sumMoney } from "./money.ts";

const sampleRows = [
  { countryId: 189, officialFee: 1000, serviceFee: 2000, translationFees: { "15": 3000 } },
  { countryId: 183, officialFee: 1100, serviceFee: 2100, translationFees: { "15": 3100 } },
  { countryId: 171, officialFee: 1200, serviceFee: 2200, translationFees: { "15": 7319.26 } },
];

test("maps supported ERP categories and blocks unmapped services", () => {
  assert.equal(categoryForConfig({ channelCode: "pct", serviceTypes: ["filing"] }), 80);
  assert.equal(categoryForConfig({ channelCode: "pct", serviceTypes: ["annuity"] }), 81);
  assert.equal(categoryForConfig({ channelCode: "ep", serviceTypes: ["epv"], epServiceType: "traditional_validation" }), 82);
  assert.equal(categoryForConfig({ channelCode: "ep", serviceTypes: ["epv"], epServiceType: "unitary_patent" }), 83);
  assert.equal(categoryForConfig({ channelCode: "ep", serviceTypes: ["european_patent_grant_registration"], epServiceType: "ep_granting" }), 84);
  assert.equal(categoryForConfig({ channelCode: "ep", serviceTypes: ["epv"], epServiceType: "traditional_validation_unitary_patent" }), 8283);
  assert.equal(quoteAvailabilityError({ channelCode: "ep", serviceTypes: ["epv"], epServiceType: "traditional_validation" }), null);
  assert.equal(quoteAvailabilityError({ channelCode: "ep", serviceTypes: ["european_patent_grant_registration"], epServiceType: "ep_granting" }), null);
});

test("validates every country and reproduces the documented total", () => {
  const input = { categoryId: 82, requestedCountryIds: [189, 183, 171], requestedTargetLangIds: [] };
  assert.equal(priceTotal(validatePriceRows(input, sampleRows)), 23019.26);
  assert.throws(() => validatePriceRows({ ...input, requestedCountryIds: [189, 183] }, [sampleRows[0]]), /missing countries/);
  assert.throws(() => validatePriceRows({ ...input, requestedCountryIds: [189] }, [sampleRows[0], sampleRows[0]]), /duplicate country/);
  assert.throws(() => validatePriceRows({ ...input, requestedCountryIds: [189] }, [{ ...sampleRows[0], serviceFee: -1 }]), /invalid serviceFee/);
  assert.throws(() => validatePriceRows({ ...input, requestedCountryIds: [189] }, [{ ...sampleRows[0], translationFees: { "15": -1 } }]), /invalid translation fee/);
});

test("excludes translation fees from the quote total when translation is not selected", () => {
  const rows = applyTranslationSelection(sampleRows, false);
  assert.deepEqual(rows.map((row) => row.translationFees), [{}, {}, {}]);
  assert.equal(priceTotal(rows), 9600);
});

test("maps selectable quote currencies to ERP currency IDs", () => {
  assert.deepEqual(erpQuoteCurrency(), {
    id: 1,
    code: "CNY",
    symbol: "CN¥",
    label: "Chinese Yuan",
  });
  assert.equal(erpQuoteCurrency("CNY").id, 1);
  assert.equal(erpQuoteCurrency("USD").id, 2);
  assert.equal(erpQuoteCurrency("EUR").id, 3);
  assert.equal(erpQuoteCurrency("GBP").id, 4);
  assert.equal(erpQuoteCurrency("HKD").id, 5);
  assert.throws(() => erpQuoteCurrency("CAD"), /not supported/);
});

test("calculates money with decimal-safe addition, multiplication, and division", () => {
  assert.equal(sumMoney([0.1, 0.2]), 0.3);
  assert.equal(sumMoney([7.76, 427.04, 360, 300]), 1094.8);
  assert.equal(multiplyMoney(1094.8, 0.9), 985.32);
  assert.equal(divideMoney(10, 3), 3.33);
  assert.throws(() => divideMoney(10, 0), /divided by zero/);
});

test("uses verified analysis metrics for ERP claim pricing", () => {
  assert.deepEqual(verifiedClaimMetrics({ claims_count: 16, claims_words: 476 }), {
    patClaims: 16,
    patClaimWords: 476,
  });
  assert.throws(
    () => verifiedClaimMetrics({ claims_count: -1, claims_words: 476 }),
    /claim count is invalid/,
  );
});

test("builds conditional ERP fields for all four EP quote categories", () => {
  const common = {
    sourceLangId: 12,
    targetLangIds: [17, 15, 58],
    countryIds: [133, 135, 157],
    translationRequired: true,
    countryRequirements: { 133: 0, 135: 1, 157: 2 } as Record<number, 0 | 1 | 2>,
    clientId: 20031901,
    priceCurrencyId: 2,
    metrics: { patClaims: 45, patTotalPages: 16, patTotalWords: 1000, patClaimWords: 500 },
  };
  assert.deepEqual(buildErpPriceRequest({ ...common, categoryId: 82, serviceItem: "traditional_validation" }), {
    categoryId: 82,
    isTranslate: 1,
    countryIdList: [133, 135, 157],
    patFilingRouteId: 1,
    patFilingTypeId: 1,
    clientId: 20031901,
    priceCurrencyId: 2,
    optType: 1,
    ...common.metrics,
  });
  assert.equal(
    "countryOptMap" in buildErpPriceRequest({
      ...common,
      categoryId: 82,
      serviceItem: "traditional_validation_opt_out",
    }),
    false,
  );
  assert.deepEqual(buildErpPriceRequest({ ...common, categoryId: 83 }), {
    categoryId: 83,
    isTranslate: 1,
    sourceLangId: 12,
    targetLangIds: [17, 15, 58],
    patFilingRouteId: 1,
    patFilingTypeId: 1,
    clientId: 20031901,
    priceCurrencyId: 2,
    ...common.metrics,
  });
  const metricsWithoutPageCount = {
    patClaims: 45,
    patTotalWords: 1000,
    patClaimWords: 500,
  };
  assert.equal(
    buildErpPriceRequest({
      ...common,
      categoryId: 82,
      serviceItem: "traditional_validation",
      metrics: metricsWithoutPageCount,
    }).patTotalPages,
    undefined,
  );
  assert.equal(
    buildErpPriceRequest({
      ...common,
      categoryId: 83,
      metrics: metricsWithoutPageCount,
    }).patTotalPages,
    undefined,
  );
  assert.equal(
    buildErpPriceRequest({
      ...common,
      categoryId: 8283,
      serviceItem: "traditional_validation",
      metrics: metricsWithoutPageCount,
    }).patTotalPages,
    undefined,
  );
  assert.deepEqual(buildErpPriceRequest({ ...common, categoryId: 84, translationRequired: false }), {
    categoryId: 84,
    isTranslate: 0,
    patFilingRouteId: 1,
    patFilingTypeId: 1,
    clientId: 20031901,
    priceCurrencyId: 2,
  });
  assert.deepEqual(buildErpPriceRequest({ ...common, categoryId: 84 }), {
    categoryId: 84,
    isTranslate: 1,
    sourceLangId: 12,
    targetLangIds: [17, 15, 58],
    patFilingRouteId: 1,
    patFilingTypeId: 1,
    clientId: 20031901,
    priceCurrencyId: 2,
    patClaimWords: 500,
  });
  assert.deepEqual(buildErpPriceRequest({ ...common, categoryId: 8283, serviceItem: "opt_out_only" }).optType, 3);
  assert.deepEqual(buildErpPriceRequest({ ...common, categoryId: 8283, serviceItem: "opt_in_only" }).optType, 4);

  const combinedFullText = buildErpPriceRequest({
    ...common,
    categoryId: 8283,
    serviceItem: "traditional_validation",
    countryRequirements: { 133: 0, 135: 2, 157: 1 },
  });
  assert.equal(combinedFullText.isTranslate, 1);
  assert.equal(combinedFullText.sourceLangId, 12);
  assert.equal(combinedFullText.targetLangIds, undefined);

  const noTranslation = buildErpPriceRequest({
    ...common,
    categoryId: 83,
    translationRequired: false,
  });
  assert.equal(noTranslation.isTranslate, 0);
  assert.equal(noTranslation.sourceLangId, undefined);
  assert.equal(noTranslation.targetLangIds, undefined);
});

test("uses the union of traditional-validation country translation requirements", () => {
  const common = {
    categoryId: 82,
    sourceLangId: 12,
    targetLangIds: [] as number[],
    serviceItem: "traditional_validation",
    translationRequired: false,
    clientId: 318,
    priceCurrencyId: 1,
    metrics: { patClaims: 45, patTotalPages: 16, patTotalWords: 1000, patClaimWords: 500 },
  };
  const none = buildErpPriceRequest({
    ...common,
    countryIds: [133],
    countryRequirements: { 133: 0 },
  });
  assert.equal(none.patClaims, undefined);
  assert.equal(none.patClaimWords, undefined);
  assert.equal(none.patTotalWords, undefined);

  const claims = buildErpPriceRequest({
    ...common,
    countryIds: [135],
    countryRequirements: { 135: 1 },
  });
  assert.equal(claims.patClaims, 45);
  assert.equal(claims.patClaimWords, 500);
  assert.equal(claims.patTotalWords, undefined);

  const fullText = buildErpPriceRequest({
    ...common,
    countryIds: [157],
    countryRequirements: { 157: 2 },
  });
  assert.equal(fullText.patClaims, undefined);
  assert.equal(fullText.patClaimWords, undefined);
  assert.equal(fullText.patTotalWords, 1000);

  const mixed = buildErpPriceRequest({
    ...common,
    categoryId: 8283,
    countryIds: [133, 135, 157],
    countryRequirements: { 133: 0, 135: 1, 157: 2 },
  });
  assert.equal(mixed.patClaims, 45);
  assert.equal(mixed.patClaimWords, 500);
  assert.equal(mixed.patTotalWords, 1000);
  assert.throws(
    () => buildErpPriceRequest({ ...common, countryIds: [999], countryRequirements: {} }),
    /Country 999 returned an invalid EPV translation requirement/,
  );
});

test("normalizes the documented combined quote response", () => {
  const rows: ErpPriceRow[] = [
    { countryId: 133, officialFee: 10, serviceFee: 200, translationFees: { "58": 0 } },
    { countryId: 135, officialFee: 10, serviceFee: 55, translationFees: { "17": 0 } },
    { countryId: 157, officialFee: 15.53, serviceFee: 22, translationFees: {} },
    { countryId: 26, officialFee: 20, serviceFee: 44, translationFees: { "15": 0 } },
    { countryId: 41, officialFee: 236.07, serviceFee: 22, translationFees: { "15": 0 } },
    { countryId: 137, officialFee: 232.93, serviceFee: 140, translationFees: {} },
    { countryId: 138, officialFee: 640, serviceFee: 2000, translationFees: {} },
    { countryId: 1001, officialFee: 0, serviceFee: 7.76, translationFees: { "17": 500, "58": 700, "15": 600 } },
  ];
  const validated = validatePriceRows({
    categoryId: 8283,
    requestedCountryIds: [133, 135, 157, 26, 41, 137, 138],
    requestedTargetLangIds: [17, 15, 58],
  }, rows);
  assert.equal(Object.values(validated.at(-1)!.translationFees).reduce((sum, fee) => sum + fee, 0), 1800);
  assert.equal(priceTotal(validated), 5455.29);
});

test("normalizes clientName and derives a stable UUID", () => {
  assert.equal(normalizeLogin("  ECI Client  "), "eci client");
  assert.equal(stableAuthUserId(318), stableAuthUserId(318));
  assert.match(stableAuthUserId(318), /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test("reuses only valid tokens and retries a 401 once", () => {
  const now = Date.parse("2026-08-18T00:00:00Z");
  assert.equal(tokenIsReusable({ expiresAt: "2026-08-18T00:10:00Z", nowMs: now }), true);
  assert.equal(tokenIsReusable({ expiresAt: "2026-08-18T00:00:30Z", nowMs: now }), false);
  assert.equal(tokenIsReusable({ expiresAt: "2026-08-18T00:10:00Z", invalidatedAt: "2026-08-18T00:00:00Z", nowMs: now }), false);
  assert.equal(shouldRetryAuthentication(401, false), true);
  assert.equal(shouldRetryAuthentication(401, true), false);
});

test("parses the ERP accesstoken and expiresin response fields", () => {
  const payload = {
    status: true,
    scode: "200",
    data: { accesstoken: "erp-token", expiresin: 7200 },
  };
  assert.equal(tokenFromPayload(payload), "erp-token");
  assert.equal(tokenLifetimeMsFromPayload(payload), 7_200_000);
});
