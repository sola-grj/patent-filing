const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

export function resolveEmailAppBaseUrl(env = process.env) {
  const configuredUrl = env.APP_BASE_URL?.trim();
  const vercelProductionUrl = withHttps(env.VERCEL_PROJECT_PRODUCTION_URL);
  const candidate =
    (configuredUrl && !isLocalUrl(configuredUrl) ? configuredUrl : null) ??
    vercelProductionUrl ??
    configuredUrl;

  if (!candidate) {
    throw new Error(
      "APP_BASE_URL is not configured. Set it to the public HTTPS URL of Pat.",
    );
  }

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error("APP_BASE_URL must be a valid absolute URL.");
  }

  if (url.protocol !== "https:" || LOCAL_HOSTNAMES.has(url.hostname)) {
    throw new Error(
      "APP_BASE_URL must be the public HTTPS URL of Pat; localhost links cannot be used in customer emails.",
    );
  }

  return url.origin;
}

function withHttps(hostname?: string) {
  const value = hostname?.trim();
  return value ? `https://${value}` : null;
}

function isLocalUrl(value: string) {
  try {
    return LOCAL_HOSTNAMES.has(new URL(value).hostname);
  } catch {
    return false;
  }
}
