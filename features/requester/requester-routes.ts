export const NEW_REQUEST_PATH = "/requester/requests/new";

export const requestPathCodes = ["ep", "pct", "paris_convention"] as const;

export type RequestPathCode = (typeof requestPathCodes)[number];
export type FreshRequestStartStep = "source" | "configure";

export function buildFreshRequestHref(
  seed = Date.now(),
  patentQuery?: string,
  startStep: FreshRequestStartStep = "source",
) {
  const searchParams = new URLSearchParams({ fresh: String(seed) });
  const normalizedQuery = patentQuery?.trim();

  if (normalizedQuery) {
    searchParams.set("q", normalizedQuery);
    if (startStep === "configure") {
      searchParams.set("step", startStep);
    }
    const requestPath = inferRequestPathFromSearch(normalizedQuery);
    if (requestPath) {
      searchParams.set("path", requestPath);
    }
  }

  return `${NEW_REQUEST_PATH}?${searchParams.toString()}`;
}

export function inferRequestPathFromSearch(
  query: string,
): RequestPathCode | undefined {
  const normalized = normalizeRequestSearchTerm(query);

  if (
    /^WO\d{8,12}(?:[A-Z]\d?)?$/.test(normalized)
    || /^PCT[A-Z]{2}\d{8,12}$/.test(normalized)
  ) {
    return "pct";
  }

  if (/^EP\d{7,10}(?:[A-Z]\d?)?$/.test(normalized)) {
    return "ep";
  }

  if (/^[A-Z]{2}\d{4,}(?:[A-Z]\d?)?$/.test(normalized)) {
    return "paris_convention";
  }

  return undefined;
}

export function parseRequestPath(value?: string): RequestPathCode | undefined {
  return requestPathCodes.find((path) => path === value);
}

export function normalizeRequestSearchTerm(value: string) {
  return value
    .normalize("NFKC")
    .toUpperCase()
    .replace(/[\s./_-]/g, "");
}
