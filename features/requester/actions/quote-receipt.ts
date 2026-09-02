import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import type { WizardPayload } from "@/features/requester/wizard-types";
import type { ErpQuotePreview, SignedQuoteEstimate } from "@/lib/eci-erp/types";

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

export class QuoteEstimateReceiptError extends Error {
  constructor(
    public readonly code: "QUOTE_ESTIMATE_EXPIRED" | "QUOTE_ESTIMATE_INVALID",
    message: string,
  ) {
    super(message);
    this.name = "QuoteEstimateReceiptError";
  }
}

export function signQuoteEstimate(input: {
  userId: string;
  organizationId: string;
  payload: WizardPayload;
  quote: ErpQuotePreview;
}): SignedQuoteEstimate {
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + RECEIPT_TTL_MS);
  const claims: QuoteReceiptClaims = {
    version: RECEIPT_VERSION,
    userId: input.userId,
    organizationId: input.organizationId,
    payloadHash: digest(receiptPayload(input.payload)),
    quoteHash: digest(input.quote),
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
  const encodedClaims = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return {
    quote: input.quote,
    receipt: `${encodedClaims}.${signature(encodedClaims)}`,
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

  const [encodedClaims, suppliedSignature, extra] = receipt.split(".");
  if (!encodedClaims || !suppliedSignature || extra) {
    throw invalidReceipt();
  }
  const expectedSignature = signature(encodedClaims);
  const supplied = Buffer.from(suppliedSignature, "base64url");
  const expected = Buffer.from(expectedSignature, "base64url");
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw invalidReceipt();
  }

  let claims: QuoteReceiptClaims;
  try {
    claims = JSON.parse(Buffer.from(encodedClaims, "base64url").toString("utf8")) as QuoteReceiptClaims;
  } catch {
    throw invalidReceipt();
  }

  if (
    claims.version !== RECEIPT_VERSION
    || claims.userId !== input.userId
    || claims.organizationId !== input.organizationId
    || claims.payloadHash !== digest(receiptPayload(input.payload))
    || claims.quoteHash !== digest(quote)
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

function receiptPayload(payload: WizardPayload) {
  const result: Partial<WizardPayload> = { ...payload };
  delete result.quotePreview;
  delete result.quoteReceipt;
  delete result.quoteReceiptExpiresAt;
  delete result.lastStep;
  return result;
}

function digest(value: unknown) {
  return createHash("sha256").update(stableJson(value)).digest("base64url");
}

function signature(value: string) {
  const configuredSecret = process.env.QUOTE_ESTIMATE_SIGNING_SECRET;
  const serviceSecret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if ((!configuredSecret || configuredSecret.length < 32) && !serviceSecret) {
    throw new Error("QUOTE_ESTIMATE_SIGNING_SECRET must contain at least 32 characters.");
  }
  const secret = configuredSecret && configuredSecret.length >= 32
    ? configuredSecret
    : createHash("sha256")
        .update(`pat-quote-estimate:${serviceSecret}`)
        .digest();
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function invalidReceipt() {
  return new QuoteEstimateReceiptError(
    "QUOTE_ESTIMATE_INVALID",
    "The estimate no longer matches this Request. Generate a new estimate before submitting.",
  );
}
