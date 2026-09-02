import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import type { WizardPayload } from "@/features/requester/wizard-types";

export class QuoteEstimateReceiptError extends Error {
  readonly code: "QUOTE_ESTIMATE_EXPIRED" | "QUOTE_ESTIMATE_INVALID";

  constructor(
    code: "QUOTE_ESTIMATE_EXPIRED" | "QUOTE_ESTIMATE_INVALID",
    message: string,
  ) {
    super(message);
    this.code = code;
    this.name = "QuoteEstimateReceiptError";
  }
}

export function quotePayloadHash(payload: WizardPayload) {
  const result: Partial<WizardPayload> = { ...payload };
  delete result.quotePreview;
  delete result.quoteReceipt;
  delete result.quoteReceiptExpiresAt;
  delete result.lastStep;
  return digestReceiptValue(result);
}

export function digestReceiptValue(value: unknown) {
  return createHash("sha256").update(stableJson(value)).digest("base64url");
}

export function signReceiptClaims(claims: object) {
  const encodedClaims = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${encodedClaims}.${signature(encodedClaims)}`;
}

export function readReceiptClaims<T>(receipt: string): T {
  const [encodedClaims, suppliedSignature, extra] = receipt.split(".");
  if (!encodedClaims || !suppliedSignature || extra) throw invalidReceipt();
  const supplied = Buffer.from(suppliedSignature, "base64url");
  const expected = Buffer.from(signature(encodedClaims), "base64url");
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw invalidReceipt();
  }
  try {
    return JSON.parse(Buffer.from(encodedClaims, "base64url").toString("utf8")) as T;
  } catch {
    throw invalidReceipt();
  }
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
