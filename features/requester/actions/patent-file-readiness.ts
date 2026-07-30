import type { SupabaseClient } from "@supabase/supabase-js";

import { enqueueSubmittedPatentCache } from "./patent-service";

const PATENT_FILE_POLL_INTERVAL_MS = 500;
const PATENT_FILE_READY_TIMEOUT_MS = 120_000;

type PatentFileState = {
  status?: string | null;
  patent_document_id?: string | null;
  storage_bucket?: string | null;
  storage_path?: string | null;
};

export async function ensureSubmittedPatentFileReady(input: {
  supabase: SupabaseClient;
  requestId: string;
  lookupReceipt: string;
  analysisReceipt: string;
}) {
  const deadline = Date.now() + PATENT_FILE_READY_TIMEOUT_MS;
  let accepted;
  try {
    accepted = await enqueueSubmittedPatentCache({
      requestId: input.requestId,
      lookupReceipt: input.lookupReceipt,
      analysisReceipt: input.analysisReceipt,
    });
  } catch (error) {
    await markPatentFileFailed(input.supabase, input.requestId);
    throw error;
  }

  if (accepted.status === "failed") {
    await markPatentFileFailed(input.supabase, input.requestId);
    throw new Error("The original patent file could not be prepared. Please retry.");
  }

  while (true) {
    const state = await readPatentFileState(input.supabase, input.requestId);
    if (isPatentFileReady(state)) {
      return;
    }
    if (state?.status === "failed") {
      throw new Error("The original patent file could not be prepared. Please retry.");
    }
    if (Date.now() >= deadline) {
      break;
    }
    await wait(PATENT_FILE_POLL_INTERVAL_MS);
  }

  throw new Error(
    "The Request was created, but the original patent file is taking longer than expected. Retry to confirm it is ready before opening the Request.",
  );
}

async function readPatentFileState(
  supabase: SupabaseClient,
  requestId: string,
) {
  const { data, error } = await supabase
    .from("request_files")
    .select("status, patent_document_id, storage_bucket, storage_path")
    .eq("request_id", requestId)
    .eq("source", "patent_search")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to verify the original patent file: ${error.message}`);
  }
  if (!data) {
    throw new Error("The submitted Request does not contain an original patent file.");
  }
  return data as PatentFileState;
}

function isPatentFileReady(state: PatentFileState | null) {
  return state?.status === "parsed"
    && Boolean(state.patent_document_id)
    && Boolean(state.storage_bucket)
    && Boolean(state.storage_path);
}

async function markPatentFileFailed(
  supabase: SupabaseClient,
  requestId: string,
) {
  await supabase
    .from("request_files")
    .update({ status: "failed" })
    .eq("request_id", requestId)
    .eq("source", "patent_search")
    .neq("status", "parsed");
}

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
