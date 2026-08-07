export type PatentDataSource = "epo" | "wipo";

export function patentSourceForChannel(
  channelCode: string,
): PatentDataSource | undefined {
  if (channelCode === "ep" || channelCode === "paris_convention") {
    return "epo";
  }
  if (channelCode === "pct") {
    return "wipo";
  }
  return undefined;
}
