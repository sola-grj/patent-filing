import { NextResponse } from "next/server";

import { fetchSubmittedPatentFile } from "@/features/requester/actions/patent-service";
import { createClient } from "@/lib/supabase/server";

type PatentFileRow = {
  status: string | null;
  patent_document_id: string | null;
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

  // This user-scoped query is the access-control boundary. request_files RLS
  // only returns files belonging to a Request that this requester/PM can access.
  const { data, error } = await supabase
    .from("request_files")
    .select("status, patent_document_id")
    .eq("request_id", requestId)
    .eq("source", "patent_search")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) {
    return NextResponse.json(
      { error: "Patent document not found." },
      { status: 404 },
    );
  }

  const patentFile = data as PatentFileRow;
  if (
    patentFile.status !== "parsed"
    || !patentFile.patent_document_id
  ) {
    return NextResponse.json(
      { error: "Patent document is not ready yet." },
      { status: 409 },
    );
  }

  let upstream: Response;
  try {
    upstream = await fetchSubmittedPatentFile(requestId);
  } catch (serviceError) {
    return NextResponse.json(
      {
        error: serviceError instanceof Error
          ? serviceError.message
          : "Patent file service is not configured.",
      },
      { status: 503 },
    );
  }

  if (!upstream.ok || !upstream.body) {
    const payload = await upstream.json().catch(() => null) as {
      error?: { message?: string };
      detail?: string;
    } | null;
    return NextResponse.json(
      {
        error: payload?.error?.message
          || payload?.detail
          || "Unable to download the patent document.",
      },
      { status: upstream.status },
    );
  }

  const headers = new Headers({
    "Content-Type": upstream.headers.get("content-type") || "application/octet-stream",
    "Content-Disposition": upstream.headers.get("content-disposition")
      || contentDisposition("patent-document.pdf"),
    "Cache-Control": "private, no-store",
  });
  const contentLength = upstream.headers.get("content-length");
  if (contentLength) headers.set("Content-Length", contentLength);
  return new Response(upstream.body, {
    status: 200,
    headers,
  });
}

function contentDisposition(fileName: string) {
  const asciiFallback = fileName
    .replace(/[^\x20-\x7E]/g, "_")
    .replace(/["\\]/g, "_");
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
