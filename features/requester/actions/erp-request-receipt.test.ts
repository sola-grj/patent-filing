import assert from "node:assert/strict";
import test from "node:test";

import type { WizardPayload } from "../wizard-types.ts";
import {
  signPreparedErpEstimate,
  type PreparedErpReceiptClaims,
  verifyPreparedErpEstimate,
} from "./erp-request-receipt-core.ts";
import { digestReceiptValue, signReceiptClaims } from "./quote-receipt-core.ts";
import type { ErpPriceRequest } from "../../../lib/eci-erp/types.ts";

process.env.QUOTE_ESTIMATE_SIGNING_SECRET = "test-only-signing-secret-with-at-least-32-characters";

const request: ErpPriceRequest = {
  categoryId: 82,
  isTranslate: 1,
  countryIdList: [26],
  patFilingRouteId: 1,
  patFilingTypeId: 1,
  clientId: 318,
  priceCurrencyId: 1,
  patClaims: 10,
  patClaimWords: 200,
};
const payload = { config: { channelCode: "ep" } } as WizardPayload;

test("accepts only the exact signed ERP body for the same user and organization", () => {
  const prepared = signPreparedErpEstimate({
    userId: "user-a",
    organizationId: "org-a",
    payload,
    request,
    currency: "CNY",
    customerName: "Customer",
    translationRequired: true,
  });
  assert.equal(verifyPreparedErpEstimate({
    receipt: prepared.receipt,
    request,
    userId: "user-a",
    organizationId: "org-a",
  }).requestHash, digestReceiptValue(request));
  assert.throws(() => verifyPreparedErpEstimate({
    receipt: prepared.receipt,
    request: { ...request, clientId: 999 },
    userId: "user-a",
    organizationId: "org-a",
  }), /invalid or was modified/);
  assert.throws(() => verifyPreparedErpEstimate({
    receipt: prepared.receipt,
    request,
    userId: "user-b",
    organizationId: "org-a",
  }), /invalid or was modified/);
  assert.throws(() => verifyPreparedErpEstimate({
    receipt: prepared.receipt,
    request,
    userId: "user-a",
    organizationId: "org-b",
  }), /invalid or was modified/);
});

test("rejects an expired prepared ERP receipt", () => {
  const expired: PreparedErpReceiptClaims = {
    version: 3,
    userId: "user-a",
    organizationId: "org-a",
    payloadHash: "payload",
    requestHash: digestReceiptValue(request),
    currency: "CNY",
    customerName: "Customer",
    translationRequired: true,
    issuedAt: "2020-01-01T00:00:00.000Z",
    expiresAt: "2020-01-01T00:01:00.000Z",
  };
  assert.throws(() => verifyPreparedErpEstimate({
    receipt: signReceiptClaims(expired),
    request,
    userId: "user-a",
    organizationId: "org-a",
  }), /expired/);
});
