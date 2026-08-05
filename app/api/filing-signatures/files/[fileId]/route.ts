import { createClient } from "@/lib/supabase/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const { fileId } = await params;
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims?.sub) {
    return new Response("Authentication required.", { status: 401 });
  }

  const { data: file, error } = await supabase
    .from("filing_signature_files")
    .select("storage_bucket, storage_path, original_filename, mime_type")
    .eq("id", fileId)
    .maybeSingle();
  if (error || !file) {
    return new Response("File not found.", { status: 404 });
  }

  const { data, error: downloadError } = await supabase.storage
    .from(file.storage_bucket)
    .download(file.storage_path);
  if (downloadError) {
    return new Response("File download failed.", { status: 404 });
  }

  return new Response(await data.arrayBuffer(), {
    headers: {
      "Content-Type": file.mime_type || "application/octet-stream",
      "Content-Disposition": contentDisposition(file.original_filename),
      "Cache-Control": "private, no-store",
    },
  });
}

function contentDisposition(fileName: string) {
  const fallback = fileName.replace(/[^a-zA-Z0-9._-]/g, "-") || "signature-file";
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
