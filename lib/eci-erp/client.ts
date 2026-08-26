import "server-only";

import { createServiceClient } from "@/lib/supabase/server";

import { loadErpConfig } from "./config";
import { decryptToken, encryptToken } from "./crypto";
import {
  shouldRetryAuthentication,
  tokenFromPayload,
  tokenIsReusable,
  tokenLifetimeMsFromPayload,
} from "./token-policy";
import type {
  ErpCountry,
  ErpCustomer,
  ErpPriceRequest,
  ErpPriceRow,
} from "./types";

const PROVIDER = "eci_erp";
const TOKEN_SKEW_MS = 60_000;

type ApiEnvelope<T> = {
  status?: boolean | number | string;
  scode?: number | string;
  message?: string;
  data?: T;
};

export class ErpIntegrationError extends Error {
  constructor(message: string, readonly code = "erp_request_failed") {
    super(message);
    this.name = "ErpIntegrationError";
  }
}

export async function getErpCustomers() {
  return erpPost<ErpCustomer[]>("/patent-portal/get-clients", {});
}

export async function getErpCountries(categoryId: number) {
  return erpPost<ErpCountry[]>(
    `/patent-portal/get-patent-countries/${categoryId}`,
    {},
  );
}

export async function getErpPrice(input: ErpPriceRequest) {
  return erpPost<ErpPriceRow[]>("/patent-portal/get-patent-price", input);
}

/**
 * Refreshes and persists the shared ERP access token without returning it to
 * the caller. Portal login uses this to prepare the server-side token cache.
 */
export async function refreshErpToken() {
  await refreshToken();
}

export async function invalidateErpToken() {
  const service = createServiceClient();
  const { error } = await service
    .from("eci_erp_tokens")
    .update({ invalidated_at: new Date().toISOString() })
    .eq("provider", PROVIDER);
  if (error) throw new ErpIntegrationError("Unable to reset the pricing service session.");
}

async function erpPost<T>(path: string, body: unknown): Promise<T> {
  let token = await getValidToken();
  let response = await request(path, body, token);
  if (shouldRetryAuthentication(response.status, false)) {
    await invalidateErpToken();
    token = await getValidToken(true);
    response = await request(path, body, token);
  }
  if (!response.ok) {
    throw new ErpIntegrationError(
      `The pricing service returned HTTP ${response.status}.`,
      `erp_http_${response.status}`,
    );
  }

  const envelope = await parseJson<ApiEnvelope<T>>(response);
  if (!isSuccessfulEnvelope(envelope) || envelope.data === undefined) {
    throw new ErpIntegrationError(
      sanitizeRemoteMessage(envelope.message),
      "erp_business_error",
    );
  }
  return envelope.data;
}

async function request(path: string, body: unknown, token: string) {
  const config = loadErpConfig();
  const businessPath = [config.appId, path.replace(/^\//, "")].join("/");
  const url = new URL(businessPath, withTrailingSlash(config.baseUrl));
  return fetch(url, {
    method: "POST",
    headers: {
      accesstoken: token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(config.timeoutMs),
  });
}

async function getValidToken(forceRefresh = false) {
  const service = createServiceClient();
  if (!forceRefresh) {
    const { data, error } = await service
      .from("eci_erp_tokens")
      .select("access_token_ciphertext, encryption_iv, encryption_tag, expires_at, invalidated_at")
      .eq("provider", PROVIDER)
      .maybeSingle();
    if (error) throw new ErpIntegrationError("Unable to read the pricing service session.");
    if (
      data
      && tokenIsReusable({
        expiresAt: data.expires_at,
        invalidatedAt: data.invalidated_at,
        skewMs: TOKEN_SKEW_MS,
      })
    ) {
      return decryptToken({
        ciphertext: data.access_token_ciphertext,
        iv: data.encryption_iv,
        tag: data.encryption_tag,
      });
    }
  }
  return refreshToken();
}

async function refreshToken() {
  const config = loadErpConfig();
  const url = new URL("open-auth/gettoken", withTrailingSlash(config.baseUrl));
  url.searchParams.set("appid", config.appId);
  url.searchParams.set("corpsecret", config.corpSecret);
  url.searchParams.set("corpid", config.corpId);

  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
    signal: AbortSignal.timeout(config.timeoutMs),
  });
  if (!response.ok) {
    throw new ErpIntegrationError(
      `Pricing service authentication returned HTTP ${response.status}.`,
      "erp_auth_failed",
    );
  }
  const payload = await parseJson<Record<string, unknown>>(response);
  const token = tokenFromPayload(payload);
  if (!token) throw new ErpIntegrationError("Pricing service authentication returned no token.");
  const expiresAt = new Date(
    Date.now() + tokenLifetimeMsFromPayload(payload),
  ).toISOString();
  const encrypted = encryptToken(token);
  const service = createServiceClient();
  const { error } = await service.from("eci_erp_tokens").upsert({
    provider: PROVIDER,
    access_token_ciphertext: encrypted.ciphertext,
    encryption_iv: encrypted.iv,
    encryption_tag: encrypted.tag,
    expires_at: expiresAt,
    invalidated_at: null,
    refreshed_at: new Date().toISOString(),
  });
  if (error) throw new ErpIntegrationError("Unable to save the pricing service session.");
  return token;
}

function isSuccessfulEnvelope(envelope: ApiEnvelope<unknown>) {
  if (envelope.status === false) return false;
  if (typeof envelope.status === "number" && ![0, 200].includes(envelope.status)) return false;
  if (typeof envelope.scode === "number" && ![0, 200].includes(envelope.scode)) return false;
  const scode = typeof envelope.scode === "string" ? Number(envelope.scode) : null;
  return scode === null || !Number.isFinite(scode) || [0, 200].includes(scode);
}

async function parseJson<T>(response: Response): Promise<T> {
  try {
    return await response.json() as T;
  } catch {
    throw new ErpIntegrationError("The pricing service returned an invalid JSON response.");
  }
}

function withTrailingSlash(url: URL) {
  const value = new URL(url);
  if (!value.pathname.endsWith("/")) value.pathname += "/";
  return value;
}

function sanitizeRemoteMessage(message?: string) {
  if (!message?.trim()) return "The pricing service could not complete the request.";
  return message
    .trim()
    .slice(0, 240)
    .replace(/[\r\n]+/g, " ")
    .replace(/\bECI\s+ERP\b|\bERP\b/gi, "pricing service");
}
