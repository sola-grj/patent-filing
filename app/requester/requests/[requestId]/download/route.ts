import JSZip from "jszip";
import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

type RequestFileRow = {
  source?: string | null;
  storage_bucket: string;
  storage_path: string;
  original_filename: string;
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

  const { data: requestRow, error: requestError } = await supabase
    .from("translation_requests")
    .select(
      "request_no, source_mode, request_files(source, storage_bucket, storage_path, original_filename)",
    )
    .eq("id", requestId)
    .maybeSingle();

  if (requestError) {
    return NextResponse.json({ error: requestError.message }, { status: 500 });
  }
  if (!requestRow) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }
  if (requestRow.source_mode !== "upload") {
    return NextResponse.json(
      { error: "This request was not created from uploaded files." },
      { status: 400 },
    );
  }

  const files = ((requestRow.request_files ?? []) as RequestFileRow[])
    .filter((file) => file.source === "upload");
  if (!files.length) {
    return NextResponse.json({ error: "No uploaded files are available" }, { status: 404 });
  }

  const zip = new JSZip();
  const usedFileNames = new Set<string>();
  const failures: string[] = [];
  let addedCount = 0;

  for (const file of files) {
    const archiveName = uniqueArchiveName(file.original_filename, usedFileNames);
    const { data, error } = await supabase.storage
      .from(file.storage_bucket)
      .download(file.storage_path);

    if (error) {
      failures.push(`${archiveName}: ${error.message}`);
      continue;
    }

    zip.file(archiveName, new Uint8Array(await data.arrayBuffer()));
    addedCount += 1;
  }

  if (!addedCount) {
    return NextResponse.json(
      { error: failures[0] ?? "Unable to prepare uploaded files." },
      { status: 500 },
    );
  }
  if (failures.length) {
    zip.file("_download-errors.txt", failures.join("\n"));
  }

  const archive = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  const baseName = safeArchiveBaseName(requestRow.request_no ?? requestId);

  return new NextResponse(Buffer.from(archive), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${baseName}-uploaded-files.zip"`,
      "Cache-Control": "private, no-store",
    },
  });
}

function safeArchiveBaseName(value: string) {
  return value
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "request";
}

function uniqueArchiveName(fileName: string, usedNames: Set<string>) {
  const normalized = fileName.trim() || "file";
  const extensionIndex = normalized.lastIndexOf(".");
  const stem = extensionIndex > 0 ? normalized.slice(0, extensionIndex) : normalized;
  const extension = extensionIndex > 0 ? normalized.slice(extensionIndex) : "";
  let candidate = normalized;
  let suffix = 2;

  while (usedNames.has(candidate)) {
    candidate = `${stem}-${suffix}${extension}`;
    suffix += 1;
  }

  usedNames.add(candidate);
  return candidate;
}
