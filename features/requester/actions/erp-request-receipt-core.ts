import type { WizardPayload } from "@/features/requester/wizard-types";
import type { ErpPriceRequest, ErpQuoteCurrencyCode, PreparedErpEstimate } from "@/lib/eci-erp/types";

import {
  digestReceiptValue,
  QuoteEstimateReceiptError,
  quotePayloadHash,
  readReceiptClaims,
  signReceiptClaims,
} from "./quote-receipt-core.ts";

const RECEIPT_VERSION = 3;
const RECEIPT_TTL_MS = 15 * 60 * 1000;

export type PreparedErpReceiptClaims = {
  version: number;
  userId: string;
  organizationId: string;
  payloadHash: string;
  requestHash: string;
  currency: ErpQuoteCurrencyCode;
  customerName: string;
  translationRequired: boolean;
  validUntil?: string;
  issuedAt: string;
  expiresAt: string;
};

export function signPreparedErpEstimate(input: {
  userId: string;
  organizationId: string;
  payload: WizardPayload;
  request: ErpPriceRequest;
  currency: ErpQuoteCurrencyCode;
  customerName: string;
  translationRequired: boolean;
  validUntil?: string;
}): PreparedErpEstimate {
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + RECEIPT_TTL_MS);
  const claims: PreparedErpReceiptClaims = {
    version: RECEIPT_VERSION,
    userId: input.userId,
    organizationId: input.organizationId,
    payloadHash: quotePayloadHash(input.payload),
    requestHash: digestReceiptValue(input.request),
    currency: input.currency,
    customerName: input.customerName,
    translationRequired: input.translationRequired,
    ...(input.validUntil ? { validUntil: input.validUntil } : {}),
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
  return {
    request: input.request,
    receipt: signReceiptClaims(claims),
    expiresAt: claims.expiresAt,
  };
}

export function verifyPreparedErpEstimate(input: {
  receipt: string;
  request: ErpPriceRequest;
  userId: string;
  organizationId: string;
}) {
  const claims = readReceiptClaims<PreparedErpReceiptClaims>(input.receipt);
  if (
    claims.version !== RECEIPT_VERSION
    || claims.userId !== input.userId
    || claims.organizationId !== input.organizationId
    || claims.requestHash !== digestReceiptValue(input.request)
  ) {
    throw invalidPreparedReceipt();
  }
  if (!Number.isFinite(Date.parse(claims.expiresAt)) || Date.parse(claims.expiresAt) <= Date.now()) {
    throw new QuoteEstimateReceiptError(
      "QUOTE_ESTIMATE_EXPIRED",
      "The prepared pricing request expired. Generate a new estimate.",
    );
  }
  return claims;
}

function invalidPreparedReceipt() {
  return new QuoteEstimateReceiptError(
    "QUOTE_ESTIMATE_INVALID",
    "The prepared pricing request is invalid or was modified.",
  );
}
