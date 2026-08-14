export type RequesterRequestScope = "mine" | "organization";

export function resolveRequesterRequestScope(
  requestSharingEnabled: boolean,
  requestedScope?: string,
): RequesterRequestScope {
  return requestSharingEnabled && requestedScope === "organization"
    ? "organization"
    : "mine";
}
