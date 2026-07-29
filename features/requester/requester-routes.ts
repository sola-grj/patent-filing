export const NEW_REQUEST_PATH = "/requester/requests/new";

export function buildFreshRequestHref(
  seed = Date.now(),
  patentQuery?: string,
) {
  const searchParams = new URLSearchParams({ fresh: String(seed) });
  const normalizedQuery = patentQuery?.trim();

  if (normalizedQuery) {
    searchParams.set("q", normalizedQuery);
  }

  return `${NEW_REQUEST_PATH}?${searchParams.toString()}`;
}
