import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const shouldApply = process.argv.includes("--apply");
const cloudUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const cloudServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const localUrl = process.env.LOCAL_SUPABASE_URL;
const localServiceRoleKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
const localDbContainer = process.env.LOCAL_SUPABASE_DB_CONTAINER ?? "supabase_db_patent-filing";
const localCustomerPassword = process.env.LOCAL_CUSTOMER_PASSWORD;

if (!cloudUrl || !cloudServiceRoleKey || !localUrl || !localServiceRoleKey) {
  throw new Error("Missing cloud or local Supabase connection settings.");
}

if (/localhost|127\.0\.0\.1/i.test(cloudUrl)) {
  throw new Error("Cloud source URL points to a local Supabase instance.");
}

if (!/localhost|127\.0\.0\.1/i.test(localUrl)) {
  throw new Error("Local target URL does not point to a local Supabase instance.");
}

const clientOptions = { auth: { autoRefreshToken: false, persistSession: false } };
const cloud = createClient(cloudUrl, cloudServiceRoleKey, clientOptions);
const local = createClient(localUrl, localServiceRoleKey, clientOptions);

async function listAllUsers(client) {
  const users = [];
  let page = 1;
  while (true) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 1000) return users;
    page += 1;
  }
}

function userLookupKey(user) {
  return user.email ? `email:${user.email.toLowerCase()}` : `phone:${user.phone}`;
}

function localUserPayload(user) {
  const password = crypto.randomBytes(32).toString("base64url");
  return {
    email: user.email ?? undefined,
    phone: user.phone ?? undefined,
    password,
    email_confirm: Boolean(user.email_confirmed_at),
    phone_confirm: Boolean(user.phone_confirmed_at),
    user_metadata: user.user_metadata ?? {},
    app_metadata: user.app_metadata ?? {},
  };
}

async function getCloudProfiles(userIds) {
  const profiles = [];
  for (let index = 0; index < userIds.length; index += 200) {
    const { data, error } = await cloud
      .from("profiles")
      .select("*")
      .in("user_id", userIds.slice(index, index + 200));
    if (error) throw error;
    profiles.push(...data);
  }
  return profiles;
}

function upsertProfilesWithLocalPostgres(profiles) {
  if (profiles.length === 0) return;
  const encodedProfiles = Buffer.from(JSON.stringify(profiles), "utf8").toString("base64");
  const sql = `
    with incoming as (
      select *
      from jsonb_to_recordset(convert_from(decode('${encodedProfiles}', 'base64'), 'UTF8')::jsonb)
        as profile(user_id uuid, display_name text, email text, phone text, default_language text, metadata jsonb, created_at timestamptz, updated_at timestamptz)
    )
    insert into public.profiles (user_id, display_name, email, phone, default_language, metadata, created_at, updated_at)
    select user_id, display_name, email, phone, default_language, coalesce(metadata, '{}'::jsonb), created_at, updated_at
    from incoming
    on conflict (user_id) do update set
      display_name = excluded.display_name,
      email = excluded.email,
      phone = excluded.phone,
      default_language = excluded.default_language,
      metadata = excluded.metadata,
      updated_at = excluded.updated_at;
  `;
  const result = spawnSync(
    "docker",
    ["exec", "-i", localDbContainer, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"],
    { input: sql, encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(`Could not upsert local profiles: ${result.stderr || result.stdout}`);
  }
}

async function getCloudLoginRelations(userIds) {
  const [membersResult, customersResult] = await Promise.all([
    cloud.from("organization_members").select("id, organization_id, user_id, role, created_at, updated_at").in("user_id", userIds),
    cloud.from("eci_erp_customers").select("client_id, client_name, normalized_login, company_name, is_black, organization_id, auth_user_id, sync_error, last_synced_at, created_at, updated_at").in("auth_user_id", userIds),
  ]);
  if (membersResult.error) throw membersResult.error;
  if (customersResult.error) throw customersResult.error;
  const organizationIds = [...new Set([
    ...membersResult.data.map((member) => member.organization_id),
    ...customersResult.data.map((customer) => customer.organization_id).filter(Boolean),
  ])];
  if (organizationIds.length === 0) {
    return { organizations: [], members: membersResult.data, customers: customersResult.data };
  }
  const organizationsResult = await cloud
    .from("organizations")
    .select("id, name, type, billing_info, metadata, created_at, updated_at")
    .in("id", organizationIds);
  if (organizationsResult.error) throw organizationsResult.error;
  return { organizations: organizationsResult.data, members: membersResult.data, customers: customersResult.data };
}

function upsertLoginRelationsWithLocalPostgres(relations) {
  const encodedRelations = Buffer.from(JSON.stringify(relations), "utf8").toString("base64");
  const sql = `
    create temporary table _sync_payload (value jsonb);
    insert into _sync_payload values (convert_from(decode('${encodedRelations}', 'base64'), 'UTF8')::jsonb);
    insert into public.organizations (id, name, type, billing_info, metadata, created_at, updated_at)
      select id, name, type::public.organization_type, coalesce(billing_info, '{}'::jsonb), coalesce(metadata, '{}'::jsonb), created_at, updated_at
      from jsonb_to_recordset((select value->'organizations' from _sync_payload))
        as organization(id uuid, name text, type text, billing_info jsonb, metadata jsonb, created_at timestamptz, updated_at timestamptz)
    on conflict (id) do update set name = excluded.name, type = excluded.type, billing_info = excluded.billing_info, metadata = excluded.metadata, updated_at = excluded.updated_at;
    insert into public.organization_members (id, organization_id, user_id, role, created_at, updated_at)
      select id, organization_id, user_id, role::public.organization_role, created_at, updated_at
      from jsonb_to_recordset((select value->'members' from _sync_payload))
        as member(id uuid, organization_id uuid, user_id uuid, role text, created_at timestamptz, updated_at timestamptz)
    on conflict (id) do update set organization_id = excluded.organization_id, user_id = excluded.user_id, role = excluded.role, updated_at = excluded.updated_at;
    insert into public.eci_erp_customers (client_id, client_name, normalized_login, company_name, is_black, organization_id, auth_user_id, raw_snapshot, sync_error, last_synced_at, created_at, updated_at)
      select client_id, client_name, normalized_login, company_name, is_black, organization_id, auth_user_id, '{}'::jsonb, sync_error, last_synced_at, created_at, updated_at
      from jsonb_to_recordset((select value->'customers' from _sync_payload))
        as customer(client_id bigint, client_name text, normalized_login text, company_name text, is_black boolean, organization_id uuid, auth_user_id uuid, sync_error text, last_synced_at timestamptz, created_at timestamptz, updated_at timestamptz)
    on conflict (client_id) do update set client_name = excluded.client_name, normalized_login = excluded.normalized_login, company_name = excluded.company_name, is_black = excluded.is_black, organization_id = excluded.organization_id, auth_user_id = excluded.auth_user_id, sync_error = excluded.sync_error, last_synced_at = excluded.last_synced_at, updated_at = excluded.updated_at;
  `;
  const result = spawnSync(
    "docker",
    ["exec", "-i", localDbContainer, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"],
    { input: sql, encoding: "utf8" },
  );
  if (result.status !== 0) throw new Error(`Could not upsert local login relations: ${result.stderr || result.stdout}`);
}

const cloudUsers = await listAllUsers(cloud);
const localUsers = await listAllUsers(local);
const localUsersByKey = new Map(localUsers.map((user) => [userLookupKey(user), user]));
const cloudProfiles = await getCloudProfiles(cloudUsers.map((user) => user.id));
const cloudRelations = await getCloudLoginRelations(cloudUsers.map((user) => user.id));

console.log(JSON.stringify({
  mode: shouldApply ? "apply" : "dry-run",
  cloudUsers: cloudUsers.length,
  cloudProfiles: cloudProfiles.length,
  existingLocalUsers: localUsers.length,
  usersToCreate: cloudUsers.filter((user) => !localUsersByKey.has(userLookupKey(user))).length,
  cloudOrganizations: cloudRelations.organizations.length,
  cloudMemberships: cloudRelations.members.length,
  cloudCustomerLogins: cloudRelations.customers.length,
}, null, 2));

if (!shouldApply) process.exit(0);

const targetUserIdBySourceUserId = new Map();
let createdUsers = 0;
for (const user of cloudUsers) {
  const existing = localUsersByKey.get(userLookupKey(user));
  if (existing) {
    targetUserIdBySourceUserId.set(user.id, existing.id);
    continue;
  }

  const { data, error } = await local.auth.admin.createUser(localUserPayload(user));
  if (error) throw error;
  targetUserIdBySourceUserId.set(user.id, data.user.id);
  createdUsers += 1;
}

const profilesToUpsert = cloudProfiles.map((profile) => ({
  ...profile,
  user_id: targetUserIdBySourceUserId.get(profile.user_id),
}));

upsertProfilesWithLocalPostgres(profilesToUpsert);

const localRelations = {
  organizations: cloudRelations.organizations,
  members: cloudRelations.members.map((member) => ({
    ...member,
    user_id: targetUserIdBySourceUserId.get(member.user_id),
  })),
  customers: cloudRelations.customers.map((customer) => ({
    ...customer,
    auth_user_id: targetUserIdBySourceUserId.get(customer.auth_user_id),
  })),
};
upsertLoginRelationsWithLocalPostgres(localRelations);

if (localRelations.customers.length > 0 && !localCustomerPassword) {
  throw new Error("LOCAL_CUSTOMER_PASSWORD is required to reset imported customer login passwords.");
}
for (const customer of localRelations.customers) {
  const { error } = await local.auth.admin.updateUserById(customer.auth_user_id, { password: localCustomerPassword });
  if (error) throw error;
}

console.log(JSON.stringify({
  createdUsers,
  syncedProfiles: profilesToUpsert.length,
  syncedOrganizations: localRelations.organizations.length,
  syncedMemberships: localRelations.members.length,
  syncedCustomerLogins: localRelations.customers.length,
  note: "Cloud passwords, sessions, MFA factors, and business data were not copied.",
}, null, 2));
