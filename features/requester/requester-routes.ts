export const NEW_REQUEST_PATH = "/requester/requests/new";

export function buildFreshRequestHref(seed = Date.now()) {
  return `${NEW_REQUEST_PATH}?fresh=${seed}`;
}
