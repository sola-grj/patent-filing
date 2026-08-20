export function tokenIsReusable(input: {
  expiresAt: string;
  invalidatedAt?: string | null;
  nowMs?: number;
  skewMs?: number;
}) {
  const nowMs = input.nowMs ?? Date.now();
  const skewMs = input.skewMs ?? 60_000;
  return !input.invalidatedAt
    && Number.isFinite(new Date(input.expiresAt).getTime())
    && new Date(input.expiresAt).getTime() - skewMs > nowMs;
}

export function shouldRetryAuthentication(status: number, alreadyRetried: boolean) {
  return status === 401 && !alreadyRetried;
}

export function tokenFromPayload(payload: Record<string, unknown>) {
  const nested = isRecord(payload.data) ? payload.data : {};
  for (const value of [
    payload.access_token,
    payload.accessToken,
    payload.accesstoken,
    payload.token,
    nested.access_token,
    nested.accessToken,
    nested.accesstoken,
    nested.token,
  ]) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export function tokenLifetimeMsFromPayload(
  payload: Record<string, unknown>,
  fallbackMs = 55 * 60 * 1000,
) {
  const nested = isRecord(payload.data) ? payload.data : {};
  const seconds = Number(
    payload.expires_in
      ?? payload.expiresIn
      ?? payload.expiresin
      ?? nested.expires_in
      ?? nested.expiresIn
      ?? nested.expiresin,
  );
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : fallbackMs;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
