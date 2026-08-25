import { createClient } from "@supabase/supabase-js";

const execute = process.argv.includes("--execute");
const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const drafts = await readAllDrafts();
const draftIds = drafts.map((draft) => draft.id);
const uploadedFiles = await readDraftUploads(draftIds);
const storagePaths = [...new Set(
  uploadedFiles
    .filter((file) => file.storage_bucket === "request-files" && file.storage_path)
    .map((file) => file.storage_path),
)];
const unexpectedBuckets = [...new Set(
  uploadedFiles
    .map((file) => file.storage_bucket)
    .filter((bucket) => bucket && bucket !== "request-files"),
)];

if (unexpectedBuckets.length) {
  throw new Error(
    `Draft uploads reference unexpected buckets: ${unexpectedBuckets.join(", ")}`,
  );
}

console.log(JSON.stringify({
  mode: execute ? "execute" : "dry-run",
  draftRequests: draftIds.length,
  uploadedDatabaseRows: uploadedFiles.length,
  requestFilesStorageObjects: storagePaths.length,
  globalPatentDocumentsDeleted: 0,
}, null, 2));

if (!execute || !draftIds.length) {
  if (!execute) {
    console.log("Dry run only. Re-run with --execute to delete the listed Draft data.");
  }
} else {
  for (const paths of chunks(storagePaths, 100)) {
    const { error } = await supabase.storage.from("request-files").remove(paths);
    if (error) throw new Error(`Unable to delete Draft Storage objects: ${error.message}`);
  }

  for (const ids of chunks(draftIds, 100)) {
    const { error } = await supabase
      .from("translation_requests")
      .delete()
      .in("id", ids)
      .eq("workflow_stage", "draft");
    if (error) throw new Error(`Unable to delete Draft requests: ${error.message}`);
  }

  const remaining = await readAllDrafts();
  if (remaining.length) {
    throw new Error(`${remaining.length} Draft requests remain after cleanup.`);
  }
  console.log(`Deleted ${draftIds.length} Draft requests and ${storagePaths.length} Storage objects.`);
}

async function readAllDrafts() {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("translation_requests")
      .select("id, request_no")
      .eq("workflow_stage", "draft")
      .order("id")
      .range(from, from + 999);
    if (error) throw new Error(`Unable to list Draft requests: ${error.message}`);
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < 1000) return rows;
  }
}

async function readDraftUploads(requestIds) {
  const rows = [];
  for (const ids of chunks(requestIds, 100)) {
    if (!ids.length) continue;
    const { data, error } = await supabase
      .from("request_files")
      .select("id, request_id, storage_bucket, storage_path")
      .in("request_id", ids)
      .eq("source", "upload");
    if (error) throw new Error(`Unable to list Draft uploads: ${error.message}`);
    rows.push(...(data ?? []));
  }
  return rows;
}

function chunks(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
