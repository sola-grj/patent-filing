import "server-only";

import type { ErpPriceRequest, ErpQuoteCurrencyCode, PreparedErpEstimate } from "@/lib/eci-erp/types";
import {
  digestReceiptValue,
  QuoteEstimateReceiptError,
  readReceiptClaims,
  signReceiptClaims,
} from "@/features/requester/actions/quote-receipt-core";

const RECEIPT_VERSION = 1;
const RECEIPT_TTL_MS = 15 * 60 * 1000;

type PreparedPmErpReceiptClaims = {
  version: number;
  userId: string;
  supplierOrganizationId: string;
  requestId: string;
  requestHash: string;
  currency: ErpQuoteCurrencyCode;
  customerName: string;
  translationRequired: boolean;
  issuedAt: string;
  expiresAt: string;
};

export function signPreparedPmErpQuote(input: {
  userId: string;
  supplierOrganizationId: string;
  requestId: string;
  request: ErpPriceRequest;
  currency: ErpQuoteCurrencyCode;
  customerName: string;
  translationRequired: boolean;
}): PreparedErpEstimate {
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + RECEIPT_TTL_MS);
  const claims: PreparedPmErpReceiptClaims = {
    version: RECEIPT_VERSION,
    userId: input.userId,
    supplierOrganizationId: input.supplierOrganizationId,
    requestId: input.requestId,
    requestHash: digestReceiptValue(input.request),
    currency: input.currency,
    customerName: input.customerName,
    translationRequired: input.translationRequired,
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
  return {
    request: input.request,
    receipt: signReceiptClaims(claims),
    expiresAt: claims.expiresAt,
  };
}

export function verifyPreparedPmErpQuote(input: {
  receipt: string;
  request: ErpPriceRequest;
  userId: string;
  supplierOrganizationId: string;
}) {
  const claims = readReceiptClaims<PreparedPmErpReceiptClaims>(input.receipt);
  if (
    claims.version !== RECEIPT_VERSION
    || claims.userId !== input.userId
    || claims.supplierOrganizationId !== input.supplierOrganizationId
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
