import "server-only";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { safeFileName } from "@/features/requester/server-utils";

import type { FilingSignatureDirection, FilingSignatureFile } from "./types";
import { signatureFileContentType } from "./validation";

export const SIGNATURE_BUCKET = "filing-signature-files";

type AuthenticatedClient = Awaited<ReturnType<typeof createClient>>;

export async function uploadSignatureFiles(
  supabase: AuthenticatedClient,
  input: {
    files: File[];
    requestId: string;
    signatureRequestId: string;
    direction: FilingSignatureDirection;
    userId: string;
  },
) {
  const service = createServiceClient();
  const uploaded: FilingSignatureFile[] = [];

  try {
    for (const file of input.files) {
      const contentType = signatureFileContentType(file);
      const folder = input.direction === "pm_to_requester" ? "source" : "return";
      const path = [
        input.userId,
        input.requestId,
        input.signatureRequestId,
        folder,
        `${crypto.randomUUID()}-${safeFileName(file.name)}`,
      ].join("/");
      const bytes = new Uint8Array(await file.arrayBuffer());
      const { error: uploadError } = await service.storage
        .from(SIGNATURE_BUCKET)
        .upload(path, bytes, { contentType, upsert: false });
      if (uploadError) {
        throw new Error(uploadError.message);
      }

      const { data, error: insertError } = await supabase
        .from("filing_signature_files")
        .insert({
          signature_request_id: input.signatureRequestId,
          direction: input.direction,
          storage_bucket: SIGNATURE_BUCKET,
          storage_path: path,
          original_filename: file.name,
          mime_type: contentType,
          file_size: file.size,
          uploaded_by: input.userId,
        })
        .select(
          "id, direction, storage_bucket, storage_path, original_filename, mime_type, file_size, uploaded_by, created_at",
        )
        .single();

      if (insertError) {
        await service.storage.from(SIGNATURE_BUCKET).remove([path]);
        throw new Error(insertError.message);
      }

      uploaded.push(data as FilingSignatureFile);
    }

    return uploaded;
  } catch (error) {
    await cleanupSignatureFiles(uploaded);
    throw error;
  }
}

export async function cleanupSignatureFiles(files: FilingSignatureFile[]) {
  if (!files.length) {
    return;
  }

  const service = createServiceClient();
  await service.storage
    .from(SIGNATURE_BUCKET)
    .remove(files.map((file) => file.storage_path));
  await service
    .from("filing_signature_files")
    .delete()
    .in("id", files.map((file) => file.id));
}

export async function removeSignatureFile(file: FilingSignatureFile) {
  const service = createServiceClient();
  const { error: rowError } = await service
    .from("filing_signature_files")
    .delete()
    .eq("id", file.id);
  if (rowError) {
    throw new Error(rowError.message);
  }

  const { error: storageError } = await service.storage
    .from(file.storage_bucket)
    .remove([file.storage_path]);
  if (storageError) {
    throw new Error(storageError.message);
  }
}
