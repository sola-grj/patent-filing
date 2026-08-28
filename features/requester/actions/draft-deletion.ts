"use server";

import { revalidatePath } from "next/cache";

import { getAuthenticatedUser, toErrorMessage } from "../server-utils";

export async function deleteRequesterDrafts(draftIds: string[]) {
  try {
    const ids = [...new Set(draftIds.filter((id) => typeof id === "string" && id))];
    if (!ids.length) {
      throw new Error("Choose at least one draft to delete.");
    }

    const { supabase, userId } = await getAuthenticatedUser();
    const { data: drafts, error: draftError } = await supabase
      .from("translation_requests")
      .select("id, request_files(storage_bucket, storage_path)")
      .in("id", ids)
      .eq("requester_id", userId)
      .eq("workflow_stage", "draft");
    if (draftError) throw new Error(draftError.message);
    if ((drafts ?? []).length !== ids.length) {
      throw new Error("One or more drafts are no longer available to delete.");
    }

    const pathsByBucket = new Map<string, string[]>();
    for (const draft of drafts ?? []) {
      for (const file of draft.request_files ?? []) {
        if (!file.storage_bucket || !file.storage_path) continue;
        const paths = pathsByBucket.get(file.storage_bucket) ?? [];
        paths.push(file.storage_path);
        pathsByBucket.set(file.storage_bucket, paths);
      }
    }
    for (const [bucket, paths] of pathsByBucket) {
      const { error } = await supabase.storage.from(bucket).remove(paths);
      if (error) throw new Error(`Unable to remove draft files: ${error.message}`);
    }

    const { error: deleteError } = await supabase
      .from("translation_requests")
      .delete()
      .in("id", ids)
      .eq("requester_id", userId)
      .eq("workflow_stage", "draft");
    if (deleteError) throw new Error(deleteError.message);

    revalidatePath("/requester");
    revalidatePath("/requester/drafts");
    revalidatePath("/requester/requests");
    return { success: true, data: { deletedCount: ids.length } };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}
