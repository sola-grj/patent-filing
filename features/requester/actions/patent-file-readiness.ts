import type { SupabaseClient } from "@supabase/supabase-js";

import {
  enqueueSubmittedPatentCache,
  persistDraftPatentCache,
} from "./patent-service";

export async function persistDraftPatentFile(input: {
  supabase: SupabaseClient;
  requestId: string;
  lookupReceipt: string;
  analysisReceipt: string;
}) {
  try {
    const persisted = await persistDraftPatentCache(input);
    if (persisted.status !== "completed") {
      throw new Error("The official patent document was not stored.");
    }
    return persisted;
  } catch (error) {
    await markPatentFileFailed(input.supabase, input.requestId);
    throw error;
  }
}

export async function enqueueSubmittedPatentFilePreparation(input: {
  supabase: SupabaseClient;
  requestId: string;
  lookupReceipt?: string;
  analysisReceipt: string;
}) {
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
    throw new Error("The patent document could not be made available. Please retry.");
  }
  return accepted;
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
