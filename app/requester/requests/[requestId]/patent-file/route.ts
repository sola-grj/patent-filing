import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

type SourceSnapshot = {
  original_file_download_url?: string | null;
};

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
    .select("request_no, request_patents(patent_number, source_snapshot)")
    .eq("id", requestId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Request not found" }, { status: 404 });

  const patent = firstRelation(data.request_patents);
  const snapshot = (patent?.source_snapshot ?? {}) as SourceSnapshot;
  const sourceUrl = snapshot.original_file_download_url;

  if (!sourceUrl) {
    return NextResponse.json({ error: "The original patent file address is unavailable." }, { status: 404 });
  }

  const parsedUrl = new URL(sourceUrl);
  if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
    return NextResponse.json({ error: "The original patent file address is invalid." }, { status: 400 });
  }

  let sourceResponse: Response;
  try {
    sourceResponse = await fetch(parsedUrl, {
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    return NextResponse.json(
      { error: "Unable to reach original_file_download_url." },
      { status: 502 },
    );
  }
  if (!sourceResponse.ok || !sourceResponse.body) {
    return NextResponse.json(
      { error: `Original patent file download returned ${sourceResponse.status}.` },
      { status: 502 },
    );
  }

  const fileName = `${patent?.patent_number || data.request_no}.pdf`;

  return new NextResponse(sourceResponse.body, {
    headers: {
      "Content-Type": sourceResponse.headers.get("content-type") || "application/pdf",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "private, no-store",
    },
  });
}

function firstRelation<T>(value: T | T[] | null) {
  return Array.isArray(value) ? value[0] ?? null : value;
}
