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
      "id, request_id, filing_signature_files(id, direction, ep_country_id, storage_bucket, storage_path, original_filename, mime_type, file_size, uploaded_by, created_at, ep_countries(name, abbr)), translation_requests(translation_requirements(ep_service_type_code))",
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
  const parentRequest = firstRelation(signatureRequest.translation_requests);
  const requirement = firstRelation(parentRequest?.translation_requirements);
  const countryScoped = [
    "traditional_validation",
    "traditional_validation_unitary_patent",
  ].includes(requirement?.ep_service_type_code ?? "");
  for (const file of files) {
    const { data, error: downloadError } = await supabase.storage
      .from(file.storage_bucket)
      .download(file.storage_path);
    if (downloadError) {
      return new Response("One or more files could not be downloaded.", { status: 500 });
    }
    const country = firstRelation(file.ep_countries);
    const countryFolder = country
      ? safeFolderName(`${country.abbr}-${country.name}`)
      : file.ep_country_id
        ? `EP-country-${file.ep_country_id}`
        : "Legacy-General";
    const target = countryScoped
      ? zip.folder(countryFolder)!
      : zip;
    target.file(uniqueZipName(target, file.original_filename), await data.arrayBuffer());
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
function firstRelation<T>(value?: T | T[] | null) {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function safeFolderName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "-").trim() || "EP-country";
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
