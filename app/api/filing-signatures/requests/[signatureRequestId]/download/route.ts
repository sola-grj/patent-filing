import JSZip from "jszip";

import { createClient } from "@/lib/supabase/server";

type Direction = "pm_to_requester" | "requester_to_pm";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ signatureRequestId: string }> },
) {
  const { signatureRequestId } = await params;
  const direction = requestedDirection(new URL(request.url).searchParams.get("direction"));
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims?.sub) {
    return new Response("Authentication required.", { status: 401 });
  }

  const { data: signatureRequest, error } = await supabase
    .from("filing_signature_requests")
    .select(
      "id, request_id, filing_signature_files(id, direction, storage_bucket, storage_path, original_filename, mime_type, file_size, uploaded_by, created_at)",
    )
    .eq("id", signatureRequestId)
    .maybeSingle();
  if (error || !signatureRequest) {
    return new Response("Signature request not found.", { status: 404 });
  }

  const files = (signatureRequest.filing_signature_files ?? [])
    .filter((file) => file.direction === direction);
  if (!files.length) {
    return new Response("No files are available for download.", { status: 404 });
  }

  const zip = new JSZip();
  for (const file of files) {
    const { data, error: downloadError } = await supabase.storage
      .from(file.storage_bucket)
      .download(file.storage_path);
    if (downloadError) {
      return new Response("One or more files could not be downloaded.", { status: 500 });
    }
    zip.file(uniqueZipName(zip, file.original_filename), await data.arrayBuffer());
  }

  const archive = await zip.generateAsync({ type: "uint8array" });
  const suffix = direction === "pm_to_requester" ? "documents" : "signed-files";
  return new Response(archive as BodyInit, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="filing-${suffix}.zip"`,
      "Cache-Control": "private, no-store",
    },
  });
}

function requestedDirection(value: string | null): Direction {
  return value === "requester_to_pm" ? value : "pm_to_requester";
}

function uniqueZipName(zip: JSZip, originalName: string) {
  const safeName = originalName.replace(/[\\/]/g, "-") || "signature-file";
  if (!zip.file(safeName)) {
    return safeName;
  }

  const dot = safeName.lastIndexOf(".");
  const base = dot > 0 ? safeName.slice(0, dot) : safeName;
  const extension = dot > 0 ? safeName.slice(dot) : "";
  let index = 2;
  while (zip.file(`${base}-${index}${extension}`)) {
    index += 1;
  }
  return `${base}-${index}${extension}`;
}
