import "server-only";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { safeFileName } from "@/features/requester/server-utils";

import type {
  FilingSignatureDirection,
  FilingSignatureFile,
  SignatureUpload,
} from "./types";
import { signatureFileContentType } from "./validation";

export const SIGNATURE_BUCKET = "filing-signature-files";

type AuthenticatedClient = Awaited<ReturnType<typeof createClient>>;

export async function uploadSignatureFiles(
  supabase: AuthenticatedClient,
  input: {
    uploads: SignatureUpload[];
    requestId: string;
    signatureRequestId: string;
    direction: FilingSignatureDirection;
    userId: string;
  },
) {
  const service = createServiceClient();
  const storedPaths: string[] = [];

  try {
    const rows = await mapWithConcurrency(input.uploads, 3, async (upload) => {
      const { file } = upload;
      const contentType = signatureFileContentType(file);
      const folder = input.direction === "pm_to_requester" ? "source" : "return";
      const path = [
        input.userId,
        input.requestId,
        input.signatureRequestId,
        folder,
        ...(upload.epCountryId === null ? [] : [`country-${upload.epCountryId}`]),
        `${crypto.randomUUID()}-${safeFileName(file.name)}`,
      ].join("/");
      const bytes = new Uint8Array(await file.arrayBuffer());
      const { error: uploadError } = await service.storage
        .from(SIGNATURE_BUCKET)
        .upload(path, bytes, { contentType, upsert: false });
      if (uploadError) throw new Error(uploadError.message);
      storedPaths.push(path);
      return {
        signature_request_id: input.signatureRequestId,
        direction: input.direction,
        ep_country_id: upload.epCountryId,
        storage_bucket: SIGNATURE_BUCKET,
        storage_path: path,
        original_filename: file.name,
        mime_type: contentType,
        file_size: file.size,
        uploaded_by: input.userId,
      };
    });

    const { data, error: insertError } = await supabase
      .from("filing_signature_files")
      .insert(rows)
      .select(
        "id, direction, ep_country_id, storage_bucket, storage_path, original_filename, mime_type, file_size, uploaded_by, created_at",
      );
    if (insertError) throw new Error(insertError.message);
    return (data ?? []) as FilingSignatureFile[];
  } catch (error) {
    if (storedPaths.length) {
      await service.storage.from(SIGNATURE_BUCKET).remove(storedPaths);
    }
    throw error;
  }
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
) {
  const results: R[] = [];
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(values[index]!);
    }
  }
  const workers = await Promise.allSettled(
    Array.from({ length: Math.min(concurrency, values.length) }, worker),
  );
  const failed = workers.find((workerResult) => workerResult.status === "rejected");
  if (failed?.status === "rejected") throw failed.reason;
  return results;
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
