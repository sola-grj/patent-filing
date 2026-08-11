import { createClient } from "@supabase/supabase-js";

const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
const patentServiceBaseUrl = requiredEnv("PATENT_SERVICE_BASE_URL").replace(/\/$/, "");
const patentServiceApiKey = process.env.PATENT_SERVICE_API_KEY?.trim() ?? "";
const batchSize = positiveInteger(process.env.DEADLINE_BACKFILL_BATCH_SIZE, 50);
const offset = nonNegativeInteger(process.env.DEADLINE_BACKFILL_OFFSET, 0);
const delayMs = nonNegativeInteger(process.env.DEADLINE_BACKFILL_DELAY_MS, 250);

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data, error } = await supabase
  .from("request_patents")
  .select("id, request_id, patent_number, source, first_priority_date, international_filing_date, grant_publication_date, rule_71_3_communication_date, source_snapshot, translation_requests!inner(channel_code, submitted_at, workflow_stage, requester_status, translation_requirements(service_types))")
  .order("created_at", { ascending: true })
  .range(offset, offset + batchSize - 1);

if (error) throw new Error(`Could not load Request patents: ${error.message}`);

let completed = 0;
let skipped = 0;
let failed = 0;

for (const row of data ?? []) {
  const request = first(row.translation_requests);
  const requirement = first(request?.translation_requirements);
  if (!needsDeadlineBasis(row, request, requirement)) {
    skipped += 1;
    continue;
  }

  try {
    const lookup = await lookupPatent(row.patent_number, row.source);
    const update = buildBasisUpdate(row, lookup);
    const missingFields = missingBasisFields(row, update, request, requirement);
    update.source_snapshot = {
      ...asObject(row.source_snapshot),
      deadline_backfill: {
        status: missingFields.length ? "incomplete" : "completed",
        fetched_at: new Date().toISOString(),
        missing_fields: missingFields,
        source: lookup.source ?? row.source ?? null,
        official_refs: lookup.raw_source_refs?.ops_deadline_register
          ?? lookup.raw_source_refs?.field_sources
          ?? null,
      },
    };

    const { error: updateError } = await supabase
      .from("request_patents")
      .update(update)
      .eq("id", row.id);
    if (updateError) throw new Error(updateError.message);
    completed += 1;
    process.stdout.write(`Updated ${row.request_id} (${row.patent_number})\n`);
  } catch (lookupError) {
    failed += 1;
    const message = lookupError instanceof Error
      ? lookupError.message
      : "Unknown deadline backfill error";
    await supabase
      .from("request_patents")
      .update({
        source_snapshot: {
          ...asObject(row.source_snapshot),
          deadline_backfill: {
            status: "failed",
            fetched_at: new Date().toISOString(),
            error: message,
          },
        },
      })
      .eq("id", row.id);
    process.stderr.write(`Failed ${row.request_id} (${row.patent_number}): ${message}\n`);
  }

  if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
}

process.stdout.write(
  `Deadline backfill finished: ${completed} updated, ${skipped} skipped, ${failed} failed.\n`,
);
if (failed > 0) process.exitCode = 1;

async function lookupPatent(patentNumber, storedSource) {
  const source = storedSource === "epo" || patentNumber.toUpperCase().startsWith("EP")
    ? "epo"
    : storedSource === "wipo" || patentNumber.toUpperCase().startsWith("WO")
      ? "wipo"
      : undefined;
  const response = await fetch(`${patentServiceBaseUrl}/api/patents/lookup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(patentServiceApiKey
        ? { Authorization: `Bearer ${patentServiceApiKey}` }
        : {}),
    },
    body: JSON.stringify({
      patent_number: patentNumber,
      include_original_file: false,
      ...(source ? { source } : {}),
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      payload?.error?.message
      ?? payload?.detail
      ?? `Patent service returned ${response.status}`,
    );
  }
  return payload;
}

function needsDeadlineBasis(row, request, requirement) {
  if (
    !request?.submitted_at
    || ["draft", "closed"].includes(request.workflow_stage)
    || ["completed", "rejected"].includes(request.requester_status)
  ) {
    return false;
  }
  return missingBasisFields(row, {}, request, requirement).length > 0;
}

function requiredBasisFields(request, requirement) {
  const services = requirement?.service_types ?? [];
  if (services.includes("european_patent_grant_registration")) {
    return ["rule_71_3_communication_date"];
  }
  if (services.includes("epv")) return ["grant_publication_date"];
  if (!services.includes("filing")) return [];
  if (request?.channel_code === "paris_convention") return ["first_priority_date"];
  if (request?.channel_code === "pct") return [];
  return [];
}

function missingBasisFields(row, update, request, requirement) {
  if (
    request?.channel_code === "pct"
    && requirement?.service_types?.includes("filing")
  ) {
    return row.first_priority_date
      || update.first_priority_date
      || row.international_filing_date
      || update.international_filing_date
      ? []
      : ["first_priority_date_or_international_filing_date"];
  }
  return requiredBasisFields(request, requirement)
    .filter((field) => !update[field] && !row[field]);
}

function buildBasisUpdate(row, lookup) {
  const update = {};
  assignMissingDate(update, row, "grant_publication_date", lookup.grant_publication_date);
  assignMissingDate(
    update,
    row,
    "rule_71_3_communication_date",
    lookup.rule_71_3_communication_date,
  );
  assignMissingDate(update, row, "first_priority_date", lookup.first_priority_date);
  assignMissingDate(
    update,
    row,
    "international_filing_date",
    lookup.international_filing_date
      ?? (lookup.source === "wipo" ? lookup.application_date : null),
  );
  return update;
}

function assignMissingDate(update, row, field, value) {
  const normalized = normalizeDate(value);
  if (!row[field] && normalized) update[field] = normalized;
}

function normalizeDate(value) {
  if (typeof value !== "string") return null;
  if (/^\d{8}$/.test(value)) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function first(value) {
  return Array.isArray(value) ? value[0] : value ?? null;
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}
