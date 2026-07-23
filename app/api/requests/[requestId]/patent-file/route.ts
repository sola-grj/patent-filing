import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

type SourceSnapshot = {
  source?: string | null;
  original_file_download_url?: string | null;
  original_file?: {
    content_type?: string | null;
    filename?: string | null;
    download_url?: string | null;
  } | null;
};

const defaultPatentServiceBaseUrl = "http://127.0.0.1:9999";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ requestId: string }> },
) {
  const { requestId } = await params;
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || !claimsData?.claims?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("translation_requests")
    .select("request_no, request_patents(patent_number, source, source_snapshot)")
    .eq("id", requestId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Request not found" }, { status: 404 });

  const patent = firstRelation(data.request_patents);
  const snapshot = (patent?.source_snapshot ?? {}) as SourceSnapshot;
  const isWipo = patent?.source === "wipo" || snapshot.source === "wipo";
  const downloadPath = isWipo
    ? snapshot.original_file?.download_url
    : snapshot.original_file_download_url || snapshot.original_file?.download_url;

  if (!downloadPath) {
    return NextResponse.json({ error: "The original patent file address is unavailable." }, { status: 404 });
  }

  const parsedUrl = resolveDownloadUrl(downloadPath, isWipo);
  if (!parsedUrl) {
    return NextResponse.json({ error: "The original patent file address is invalid." }, { status: 400 });
  }

  let sourceResponse: Response;
  try {
    sourceResponse = await fetch(parsedUrl, {
      cache: "no-store",
      signal: AbortSignal.timeout(120_000),
    });
  } catch {
    return NextResponse.json(
      { error: "Unable to reach the original patent file download path." },
      { status: 502 },
    );
  }
  if (!sourceResponse.ok || !sourceResponse.body) {
    return NextResponse.json(
      { error: `Original patent file download returned ${sourceResponse.status}.` },
      { status: 502 },
    );
  }

  const fileName =
    snapshot.original_file?.filename?.trim()
    || `${patent?.patent_number || data.request_no}.pdf`;

  return new NextResponse(sourceResponse.body, {
    headers: {
      "Content-Type": sourceResponse.headers.get("content-type") || "application/pdf",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "private, no-store",
    },
  });
}

function resolveDownloadUrl(downloadPath: string, requirePatentServiceOrigin: boolean) {
  try {
    const baseUrl = new URL(
      process.env.PATENT_SERVICE_BASE_URL ?? defaultPatentServiceBaseUrl,
    );
    const downloadUrl = new URL(downloadPath, baseUrl);

    if (!["https:", "http:"].includes(downloadUrl.protocol)) {
      return null;
    }

    if (requirePatentServiceOrigin && downloadUrl.origin !== baseUrl.origin) {
      return null;
    }

    return downloadUrl;
  } catch {
    return null;
  }
}

function firstRelation<T>(value: T | T[] | null) {
  return Array.isArray(value) ? value[0] ?? null : value;
}
