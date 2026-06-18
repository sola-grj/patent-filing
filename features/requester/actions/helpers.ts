import type { getAuthenticatedUser } from "../server-utils";

export async function writeRequestEvent(
  supabase: Awaited<ReturnType<typeof getAuthenticatedUser>>["supabase"],
  requestId: string,
  actorId: string,
  eventType: string,
  fromStatus?: string | null,
  toStatus?: string | null,
  payload: Record<string, unknown> = {},
) {
  await supabase.from("request_events").insert({
    request_id: requestId,
    actor_id: actorId,
    event_type: eventType,
    from_status: fromStatus,
    to_status: toStatus,
    payload,
  });
}

export async function nextVersion(
  supabase: Awaited<ReturnType<typeof getAuthenticatedUser>>["supabase"],
  table: "request_config_versions" | "quotes",
  requestId: string,
) {
  const { data } = await supabase
    .from(table)
    .select("version_no")
    .eq("request_id", requestId)
    .order("version_no", { ascending: false })
    .limit(1)
    .maybeSingle();

  return Number(data?.version_no ?? 0) + 1;
}

export function inferFileRole(fileName: string) {
  const lower = fileName.toLowerCase();
  if (lower.includes("claim")) return "claims";
  if (lower.includes("abstract")) return "abstract";
  if (lower.includes("office")) return "office_action";
  return "patent_document";
}

export function inferLanguage(fileName: string) {
  const lower = fileName.toLowerCase();
  if (lower.includes("_zh") || lower.includes("-zh")) return "zh-CN";
  if (lower.includes("_ja") || lower.includes("-ja")) return "ja";
  if (lower.includes("_de") || lower.includes("-de")) return "de";
  return "en";
}

export function sumParseMetric(files: Array<Record<string, unknown>>, metric: string) {
  return files.reduce((total, file) => {
    const result = Array.isArray(file.file_parse_results)
      ? file.file_parse_results[0]
      : file.file_parse_results;
    return total + Number(result?.[metric] ?? 0);
  }, 0);
}

export function calculateQuote(wordCount: number, qualityLevel: string, urgent: boolean) {
  const qualityFactor = qualityLevel.includes("review")
    ? 1.65
    : qualityLevel.includes("patent")
      ? 1.35
      : 1;
  const urgentFactor = urgent ? 1.25 : 1;
  return Math.round(wordCount * 0.12 * qualityFactor * urgentFactor);
}
