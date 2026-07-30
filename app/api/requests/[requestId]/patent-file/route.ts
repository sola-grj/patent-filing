import { NextResponse } from "next/server";

import { createClient, createServiceClient } from "@/lib/supabase/server";

type PatentFileRow = {
  original_filename: string | null;
  status: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
};

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

  // This user-scoped query is the access-control boundary. request_files RLS
  // only returns files belonging to a Request that this requester/PM can access.
  const { data, error } = await supabase
    .from("request_files")
    .select("original_filename, status, storage_bucket, storage_path")
    .eq("request_id", requestId)
    .eq("source", "patent_search")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) {
    return NextResponse.json(
      { error: "Original patent file not found." },
      { status: 404 },
    );
  }

  const patentFile = data as PatentFileRow;
  if (
    patentFile.status !== "parsed"
    || !patentFile.storage_bucket
    || !patentFile.storage_path
  ) {
    return NextResponse.json(
      { error: "Original patent file is not ready yet." },
      { status: 409 },
    );
  }

  let storage;
  try {
    storage = createServiceClient().storage.from(patentFile.storage_bucket);
  } catch (serviceError) {
    return NextResponse.json(
      {
        error: serviceError instanceof Error
          ? serviceError.message
          : "Supabase service access is not configured.",
      },
      { status: 503 },
    );
  }

  const { data: file, error: downloadError } = await storage.download(
    patentFile.storage_path,
  );
  if (downloadError || !file) {
    return NextResponse.json(
      {
        error: downloadError?.message || "Unable to read the stored patent file.",
      },
      { status: 502 },
    );
  }

  const fileName = patentFile.original_filename || "patent-document.pdf";

  return new Response(file, {
    status: 200,
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "Content-Disposition": contentDisposition(fileName),
      "Content-Length": String(file.size),
      "Cache-Control": "private, no-store",
    },
  });
}

function contentDisposition(fileName: string) {
  const asciiFallback = fileName
    .replace(/[^\x20-\x7E]/g, "_")
    .replace(/["\\]/g, "_");
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
