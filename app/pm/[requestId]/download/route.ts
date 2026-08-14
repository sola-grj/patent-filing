import JSZip from "jszip";
import { NextResponse } from "next/server";

import { getPmContext } from "@/features/pm/server-utils";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

  if (!uuidPattern.test(requestId)) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  const context = await getPmContext();
  if (!context.isStaff || !context.organization) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const supabase = context.supabase;

  const { data: requestRow, error: requestError } = await supabase
    .from("translation_requests")
    .select("request_no, request_files(source, storage_bucket, storage_path, original_filename, metadata)")
    .eq("id", requestId)
    .eq("supplier_organization_id", context.organization.id)
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
  supabase: Awaited<ReturnType<typeof getPmContext>>["supabase"],
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
