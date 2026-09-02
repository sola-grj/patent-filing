import "server-only";

import type { WizardPayload } from "@/features/requester/wizard-types";
import type { ErpQuotePreview, SignedQuoteEstimate } from "@/lib/eci-erp/types";
import {
  digestReceiptValue,
  QuoteEstimateReceiptError,
  quotePayloadHash,
  readReceiptClaims,
  signReceiptClaims,
} from "./quote-receipt-core";

export {
  digestReceiptValue,
  QuoteEstimateReceiptError,
  quotePayloadHash,
  readReceiptClaims,
  signReceiptClaims,
} from "./quote-receipt-core";

const RECEIPT_VERSION = 1;
const RECEIPT_TTL_MS = 15 * 60 * 1000;

type QuoteReceiptClaims = {
  version: number;
  userId: string;
  organizationId: string;
  payloadHash: string;
  quoteHash: string;
  issuedAt: string;
  expiresAt: string;
};

export function signQuoteEstimate(input: {
  userId: string;
  organizationId: string;
  payload: WizardPayload;
  quote: ErpQuotePreview;
}): SignedQuoteEstimate {
  return signQuoteEstimateFromPayloadHash({
    userId: input.userId,
    organizationId: input.organizationId,
    payloadHash: quotePayloadHash(input.payload),
    quote: input.quote,
  });
}

export function signQuoteEstimateFromPayloadHash(input: {
  userId: string;
  organizationId: string;
  payloadHash: string;
  quote: ErpQuotePreview;
}): SignedQuoteEstimate {
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + RECEIPT_TTL_MS);
  const claims: QuoteReceiptClaims = {
    version: RECEIPT_VERSION,
    userId: input.userId,
    organizationId: input.organizationId,
    payloadHash: input.payloadHash,
    quoteHash: digestReceiptValue(input.quote),
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
  return {
    quote: input.quote,
    receipt: signReceiptClaims(claims),
    issuedAt: claims.issuedAt,
    expiresAt: claims.expiresAt,
  };
}

export function verifyQuoteEstimateReceipt(input: {
  userId: string;
  organizationId: string;
  payload: WizardPayload;
}) {
  const receipt = input.payload.quoteReceipt;
  const quote = input.payload.quotePreview;
  if (!receipt || !quote) {
    throw new QuoteEstimateReceiptError(
      "QUOTE_ESTIMATE_INVALID",
      "Generate a current estimate before submitting this Request.",
    );
  }

  const claims = readReceiptClaims<QuoteReceiptClaims>(receipt);

  if (
    claims.version !== RECEIPT_VERSION
    || claims.userId !== input.userId
    || claims.organizationId !== input.organizationId
    || claims.payloadHash !== quotePayloadHash(input.payload)
    || claims.quoteHash !== digestReceiptValue(quote)
  ) {
    throw invalidReceipt();
  }
  if (!Number.isFinite(Date.parse(claims.expiresAt)) || Date.parse(claims.expiresAt) <= Date.now()) {
    throw new QuoteEstimateReceiptError(
      "QUOTE_ESTIMATE_EXPIRED",
      "The estimate expired and must be revalidated before submission.",
    );
  }
  return quote;
}

function invalidReceipt() {
  return new QuoteEstimateReceiptError(
    "QUOTE_ESTIMATE_INVALID",
    "The estimate no longer matches this Request. Generate a new estimate before submitting.",
  );
}
