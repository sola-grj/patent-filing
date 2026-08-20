import "server-only";

export type ErpConfig = ReturnType<typeof loadErpConfig>;

export function loadErpConfig() {
  const baseUrl = requiredUrl("ERP_BASE_URL");
  enforceProductionHttps(baseUrl, "ERP_BASE_URL");

  return {
    baseUrl,
    appId: required("ECI_ERP_APP_ID"),
    corpSecret: required("ECI_ERP_CORP_SECRET"),
    corpId: required("ECI_ERP_CORP_ID"),
    timeoutMs: positiveInteger("ECI_ERP_TIMEOUT_MS", 15_000),
    initialPassword: process.env.ECI_ERP_INITIAL_PASSWORD ?? "password",
  };
}

export function tokenEncryptionKey() {
  const encoded = required("ECI_ERP_TOKEN_ENCRYPTION_KEY");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) {
    throw new Error("ECI_ERP_TOKEN_ENCRYPTION_KEY must be a 32-byte base64 key.");
  }
  return key;
}

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function requiredUrl(name: string) {
  const value = required(name);
  try {
    return new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL.`);
  }
}

function positiveInteger(name: string, fallback: number) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

function enforceProductionHttps(url: URL, name: string) {
  if (process.env.VERCEL_ENV === "production" && url.protocol !== "https:") {
    throw new Error(`${name} must use HTTPS in production.`);
  }
}
