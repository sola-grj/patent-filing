import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ requestId: string }> },
) {
  const { requestId } = await params;
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || !claimsData?.claims?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // This user-scoped query is the access-control boundary. RLS only returns a
  // Request that the signed-in requester/PM can access.
  const { data, error } = await supabase
    .from("translation_requests")
    .select("id")
    .eq("id", requestId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Request not found" }, { status: 404 });

  const apiKey = process.env.PATENT_SERVICE_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "Patent file service authentication is not configured." },
      { status: 503 },
    );
  }
  const baseUrl = (
    process.env.PATENT_SERVICE_BASE_URL ?? "http://127.0.0.1:9999"
  ).replace(/\/$/, "");

  let upstream: Response;
  try {
    upstream = await fetch(
      `${baseUrl}/api/patents/cache/requests/${encodeURIComponent(requestId)}/file`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        cache: "no-store",
        signal: AbortSignal.any([
          request.signal,
          AbortSignal.timeout(120_000),
        ]),
      },
    );
  } catch {
    return NextResponse.json(
      { error: "Unable to reach the stored patent file service." },
      { status: 502 },
    );
  }

  if (!upstream.ok || !upstream.body) {
    const payload = await upstream.json().catch(() => null) as {
      error?: { message?: string };
      detail?: string;
    } | null;
    return NextResponse.json(
      {
        error:
          payload?.error?.message
          || payload?.detail
          || `Stored patent file download returned ${upstream.status}.`,
      },
      { status: upstream.status },
    );
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("content-type")
        || "application/octet-stream",
      "Content-Disposition": upstream.headers.get("content-disposition")
        || "attachment; filename=patent-document.pdf",
      "Cache-Control": "private, no-store",
    },
  });
}
