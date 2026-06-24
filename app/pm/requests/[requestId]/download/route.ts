import JSZip from "jszip";
import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

type RequestFileRow = {
  source?: string | null;
  storage_bucket: string;
  storage_path: string;
  original_filename: string;
  metadata?: { source_url?: string } | null;
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ requestId: string }> },
) {
  const { requestId } = await params;
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;

  if (claimsError || !userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: memberships, error: membershipError } = await supabase
    .from("organization_members")
    .select("id")
    .eq("user_id", userId)
    .in("role", ["pm", "ops", "admin"])
    .limit(1);

  if (membershipError) {
    return NextResponse.json({ error: membershipError.message }, { status: 500 });
  }

  if (!(memberships ?? []).length) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: requestRow, error: requestError } = await supabase
    .from("translation_requests")
    .select("request_no, request_files(source, storage_bucket, storage_path, original_filename, metadata)")
    .eq("id", requestId)
    .maybeSingle();

  if (requestError) {
    return NextResponse.json({ error: requestError.message }, { status: 500 });
  }

  if (!requestRow) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  const files = (requestRow.request_files ?? []) as RequestFileRow[];
  if (!files.length) {
    return NextResponse.json({ error: "No files available for download" }, { status: 404 });
  }

  const zip = new JSZip();
  const usedFileNames = new Set<string>();
  const failures: string[] = [];
  let addedCount = 0;

  for (const file of files) {
    const archiveName = uniqueArchiveName(file.original_filename, usedFileNames);

    try {
      const bytes = await readFileBytes(supabase, file);
      zip.file(archiveName, bytes);
      addedCount += 1;
    } catch (error) {
      failures.push(`${archiveName}: ${error instanceof Error ? error.message : "Download failed"}`);
    }
  }

  if (!addedCount) {
    return NextResponse.json(
      { error: failures[0] ?? "Unable to prepare request files." },
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
      "Content-Disposition": `attachment; filename="${baseName}-files.zip"`,
      "Cache-Control": "no-store",
    },
  });
}

async function readFileBytes(
  supabase: Awaited<ReturnType<typeof createClient>>,
  file: RequestFileRow,
) {
  const sourceUrl = typeof file.metadata?.source_url === "string"
    ? file.metadata.source_url
    : null;

  if (file.source === "patent_search" && sourceUrl) {
    const response = await fetch(sourceUrl);
    if (!response.ok) {
      throw new Error(`Source download returned ${response.status}`);
    }

    return new Uint8Array(await response.arrayBuffer());
  }

  const { data, error } = await supabase.storage
    .from(file.storage_bucket)
    .download(file.storage_path);

  if (error) {
    throw new Error(error.message);
  }

  return new Uint8Array(await data.arrayBuffer());
}

function safeArchiveBaseName(value: string) {
  return value.replace(/[^a-zA-Z0-9-_]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "request";
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
