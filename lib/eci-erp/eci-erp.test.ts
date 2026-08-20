import assert from "node:assert/strict";
import test from "node:test";

import {
  categoryForConfig,
  normalizeLogin,
  priceTotal,
  quoteAvailabilityError,
  stableAuthUserId,
  validatePriceRows,
} from "./pricing-rules.ts";
import {
  shouldRetryAuthentication,
  tokenFromPayload,
  tokenIsReusable,
  tokenLifetimeMsFromPayload,
} from "./token-policy.ts";
import { erpQuoteCurrency } from "./types.ts";

const sampleRows = [
  { countryId: 189, officialFee: 1000, serviceFee: 2000, translationFee: 3000 },
  { countryId: 183, officialFee: 1100, serviceFee: 2100, translationFee: 3100 },
  { countryId: 171, officialFee: 1200, serviceFee: 2200, translationFee: 7319.26 },
];

test("maps supported ERP categories and blocks unmapped services", () => {
  assert.equal(categoryForConfig({ channelCode: "pct", serviceTypes: ["filing"] }), 80);
  assert.equal(categoryForConfig({ channelCode: "pct", serviceTypes: ["annuity"] }), 81);
  assert.equal(categoryForConfig({ channelCode: "ep", serviceTypes: ["epv"], epvType: "traditional_validation" }), 82);
  assert.equal(categoryForConfig({ channelCode: "ep", serviceTypes: ["epv"], epvType: "unitary_effect" }), 83);
  assert.match(quoteAvailabilityError({ channelCode: "ep", serviceTypes: ["epv"], epvType: "traditional_validation" })!, /Opt Type/);
  assert.match(quoteAvailabilityError({ channelCode: "ep", serviceTypes: ["european_patent_grant_registration"] })!, /not available/);
});

test("validates every country and reproduces the documented EUR total", () => {
  assert.equal(priceTotal(validatePriceRows([189, 183, 171], sampleRows)), 23019.26);
  assert.throws(() => validatePriceRows([189, 183], [sampleRows[0]]), /missing countries/);
  assert.throws(() => validatePriceRows([189], [sampleRows[0], sampleRows[0]]), /duplicate country/);
  assert.throws(() => validatePriceRows([189], [{ ...sampleRows[0], serviceFee: -1 }]), /invalid serviceFee/);
});

test("maps selectable quote currencies to ERP currency IDs", () => {
  assert.deepEqual(erpQuoteCurrency(), { id: 3, code: "EUR", label: "Euro" });
  assert.equal(erpQuoteCurrency("USD").id, 2);
  assert.equal(erpQuoteCurrency("GBP").id, 4);
  assert.throws(() => erpQuoteCurrency("CAD"), /not supported/);
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
