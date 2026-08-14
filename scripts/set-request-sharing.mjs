import { createClient } from "@supabase/supabase-js";

const args = parseArgs(process.argv.slice(2));
const organizationId = requiredArg(args, "organization-id");
const changedByEmail = requiredArg(args, "changed-by-email");
const reason = requiredArg(args, "reason");
const enabledValue = requiredArg(args, "enabled").toLowerCase();

if (!['true', 'false'].includes(enabledValue)) {
  fail("--enabled must be true or false.");
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  fail("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const { data, error } = await supabase.rpc("admin_set_request_sharing", {
  target_organization_id: organizationId,
  sharing_enabled: enabledValue === "true",
  changed_by_email: changedByEmail,
  change_reason: reason,
});

if (error) fail(error.message);
const settings = Array.isArray(data) ? data[0] : data;
if (!settings) fail("The database did not return the updated organization setting.");

console.log(
  JSON.stringify(
    {
      organizationId: settings.organization_id,
      requestSharingEnabled: settings.request_sharing_enabled,
      updatedAt: settings.updated_at,
    },
    null,
    2,
  ),
);

function parseArgs(values) {
  const parsed = new Map();
  for (let index = 0; index < values.length; index += 1) {
    const key = values[index];
    if (!key.startsWith("--")) fail(`Unexpected argument: ${key}`);
    const value = values[index + 1];
    if (!value || value.startsWith("--")) fail(`Missing value for ${key}.`);
    parsed.set(key.slice(2), value);
    index += 1;
  }
  return parsed;
}

function requiredArg(argsMap, name) {
  const value = argsMap.get(name)?.trim();
  if (!value) fail(`--${name} is required.`);
  return value;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
