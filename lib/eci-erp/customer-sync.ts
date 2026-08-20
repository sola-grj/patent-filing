import "server-only";

import { createServiceClient } from "@/lib/supabase/server";

import { getErpCustomers } from "./client";
import { loadErpConfig } from "./config";
import { normalizeLogin, stableAuthUserId } from "./pricing-rules";
import type { ErpCustomer } from "./types";

export type CustomerSyncSummary = {
  runId: string;
  status: "succeeded" | "partial" | "failed";
  sourceCount: number;
  successCount: number;
  errorCount: number;
};

type CustomerOrganization = { id: string; name: string };

export async function syncErpCustomers(): Promise<CustomerSyncSummary> {
  const service = createServiceClient();
  const { data: run, error: runError } = await service
    .from("eci_erp_sync_runs")
    .insert({ status: "running" })
    .select("id")
    .single();
  if (runError) {
    throw new Error("An ECI ERP customer sync is already running.");
  }

  try {
    const customers = normalizeCustomers(await getErpCustomers());
    const duplicateLogins = duplicatedLogins(customers);
    const { error: staleError } = await service
      .from("eci_erp_customers")
      .update({ sync_error: "Not present in the latest ERP customer list." })
      .is("sync_error", null);
    if (staleError) throw new Error("Unable to prepare ERP customer reconciliation.");
    const { data: organizations, error: organizationsError } = await service
      .from("organizations")
      .select("id, name")
      .eq("type", "customer");
    if (organizationsError) throw new Error("Unable to load customer organizations.");
    const organizationList = [...(organizations ?? [])] as CustomerOrganization[];

    let successCount = 0;
    let errorCount = 0;
    for (const customer of customers) {
      const duplicate = duplicateLogins.has(normalizeLogin(customer.clientName));
      try {
        await upsertRawCustomer(customer, duplicate ? "Duplicate clientName in ERP response." : null);
        if (duplicate) throw new Error("Duplicate clientName in ERP response.");
        await syncCustomer(customer, organizationList);
        successCount += 1;
      } catch (error) {
        errorCount += 1;
        await recordCustomerError(customer, error);
      }
    }

    const status = errorCount ? "partial" : "succeeded";
    await finishRun(run.id, status, customers.length, successCount, errorCount);
    return {
      runId: run.id,
      status,
      sourceCount: customers.length,
      successCount,
      errorCount,
    };
  } catch (error) {
    await finishRun(run.id, "failed", 0, 0, 1, safeError(error));
    throw error;
  }
}

async function syncCustomer(
  customer: ErpCustomer,
  organizations: CustomerOrganization[],
) {
  const service = createServiceClient();
  const matchingOrganizations = organizations.filter(
    (organization) => normalizedCompany(organization.name) === normalizedCompany(customer.companyName),
  );
  if (matchingOrganizations.length > 1) {
    throw new Error("Multiple customer organizations match companyName.");
  }

  let organization = matchingOrganizations[0];
  if (!organization) {
    const { data, error } = await service
      .from("organizations")
      .insert({
        name: customer.companyName,
        type: "customer",
        metadata: { source: "eci_erp", erpClientId: customer.clientId },
      })
      .select("id, name")
      .single();
    if (error) throw new Error("Unable to create the customer organization.");
    organization = data;
    organizations.push(data);
  }

  const userId = stableAuthUserId(customer.clientId);
  const email = syntheticEmail(customer.clientId);
  const { data: existingUser } = await service.auth.admin.getUserById(userId);
  if (!existingUser.user) {
    const { error } = await service.auth.admin.createUser({
      id: userId,
      email,
      password: loadErpConfig().initialPassword,
      email_confirm: true,
      user_metadata: { display_name: customer.clientName, client_name: customer.clientName },
      app_metadata: { source: "eci_erp", erp_client_id: customer.clientId },
    });
    if (error) throw new Error("Unable to create the customer login.");
  } else {
    const { error } = await service.auth.admin.updateUserById(userId, {
      user_metadata: {
        ...existingUser.user.user_metadata,
        display_name: customer.clientName,
        client_name: customer.clientName,
      },
      app_metadata: {
        ...existingUser.user.app_metadata,
        source: "eci_erp",
        erp_client_id: customer.clientId,
      },
    });
    if (error) throw new Error("Unable to update the customer login.");
  }

  await syncProfile(userId, email, customer, !existingUser.user);
  await setBlacklistState(userId, organization.id, customer.isBlack);
  await ensureCustomerRelationship(organization.id);
  const { error: mappingError } = await service
    .from("eci_erp_customers")
    .update({
      organization_id: organization.id,
      auth_user_id: userId,
      sync_error: null,
      last_synced_at: new Date().toISOString(),
    })
    .eq("client_id", customer.clientId);
  if (mappingError) throw new Error("Unable to save the ERP customer mapping.");
}

async function syncProfile(
  userId: string,
  email: string,
  customer: ErpCustomer,
  isNewUser: boolean,
) {
  const service = createServiceClient();
  const { data: profile, error: profileError } = await service
    .from("profiles")
    .select("user_id, metadata")
    .eq("user_id", userId)
    .maybeSingle();
  if (profileError) throw new Error("Unable to load the customer profile.");
  const values = {
    display_name: customer.clientName,
    email,
    metadata: {
      ...((profile?.metadata as Record<string, unknown> | null) ?? {}),
      source: "eci_erp",
      clientId: customer.clientId,
      clientName: customer.clientName,
    },
  };
  const result = profile
    ? await service.from("profiles").update({
        ...values,
        ...(isNewUser ? { password_setup_required: true } : {}),
      }).eq("user_id", userId)
    : await service.from("profiles").insert({
        user_id: userId,
        ...values,
        password_setup_required: isNewUser,
      });
  if (result.error) throw new Error("Unable to save the customer profile.");
}

async function setBlacklistState(
  userId: string,
  organizationId: string,
  isBlack: boolean,
) {
  const service = createServiceClient();
  const { error: authError } = await service.auth.admin.updateUserById(userId, {
    ban_duration: isBlack ? "876000h" : "none",
  });
  if (authError) throw new Error("Unable to update the customer login status.");
  if (isBlack) {
    const { error } = await service
      .from("organization_members")
      .delete()
      .eq("organization_id", organizationId)
      .eq("user_id", userId)
      .eq("role", "requester");
    if (error) throw new Error("Unable to remove the blacklisted customer membership.");
    return;
  }
  const { error } = await service.from("organization_members").upsert({
    organization_id: organizationId,
    user_id: userId,
    role: "requester",
    is_org_admin: true,
  }, { onConflict: "organization_id,user_id,role" });
  if (error) throw new Error("Unable to restore the customer membership.");
}

async function ensureCustomerRelationship(organizationId: string) {
  const service = createServiceClient();
  const { data: supplier, error: supplierError } = await service
    .from("organizations")
    .select("id")
    .eq("type", "supplier")
    .ilike("code", "eci")
    .single();
  if (supplierError) throw new Error("The ECI supplier organization is unavailable.");
  const [{ error: settingsError }, { data: relationship, error: relationshipError }] =
    await Promise.all([
      service.from("customer_organization_settings").upsert({
        organization_id: organizationId,
        request_sharing_enabled: false,
      }, { onConflict: "organization_id", ignoreDuplicates: true }),
      service
        .from("customer_supplier_relationships")
        .select("id, supplier_organization_id")
        .eq("customer_organization_id", organizationId)
        .eq("status", "active")
        .maybeSingle(),
    ]);
  if (settingsError || relationshipError) {
    throw new Error("Unable to load the customer supplier relationship.");
  }
  if (relationship && relationship.supplier_organization_id !== supplier.id) {
    throw new Error("The customer organization is linked to a different supplier.");
  }
  if (!relationship) {
    const { error } = await service.from("customer_supplier_relationships").insert({
      customer_organization_id: organizationId,
      supplier_organization_id: supplier.id,
      status: "active",
    });
    if (error) throw new Error("Unable to create the ECI supplier relationship.");
  }
}

async function upsertRawCustomer(customer: ErpCustomer, syncError: string | null) {
  const service = createServiceClient();
  const { error } = await service.from("eci_erp_customers").upsert({
    client_id: customer.clientId,
    client_name: customer.clientName,
    normalized_login: normalizeLogin(customer.clientName),
    company_name: customer.companyName,
    is_black: customer.isBlack,
    raw_snapshot: customer,
    sync_error: syncError,
    last_synced_at: new Date().toISOString(),
  });
  if (error) throw new Error("Unable to save the ERP customer record.");
}

async function recordCustomerError(customer: ErpCustomer, error: unknown) {
  const service = createServiceClient();
  const message = safeError(error);
  await Promise.all([
    service
      .from("eci_erp_customers")
      .update({ sync_error: message, last_synced_at: new Date().toISOString() })
      .eq("client_id", customer.clientId),
    service.from("eci_erp_integration_errors").insert({
      operation: "customer_sync",
      external_identifier: String(customer.clientId),
      error_code: "customer_sync_failed",
      detail: { message },
    }),
  ]);
}

async function finishRun(
  runId: string,
  status: CustomerSyncSummary["status"],
  sourceCount: number,
  successCount: number,
  errorCount: number,
  errorSummary?: string,
) {
  const service = createServiceClient();
  await service.from("eci_erp_sync_runs").update({
    status,
    source_count: sourceCount,
    success_count: successCount,
    error_count: errorCount,
    completed_at: new Date().toISOString(),
    error_summary: errorSummary ?? null,
  }).eq("id", runId);
}

function normalizeCustomers(customers: ErpCustomer[]) {
  const ids = new Set<number>();
  return customers.map((customer) => {
    const clientId = Number(customer.clientId);
    const clientName = String(customer.clientName ?? "").trim();
    const companyName = String(customer.companyName ?? "").trim();
    if (!Number.isSafeInteger(clientId) || clientId <= 0 || !clientName || !companyName) {
      throw new Error("ECI ERP returned an invalid customer record.");
    }
    if (ids.has(clientId)) throw new Error(`ECI ERP returned duplicate clientId ${clientId}.`);
    ids.add(clientId);
    return { clientId, clientName, companyName, isBlack: customer.isBlack === true };
  });
}

function duplicatedLogins(customers: ErpCustomer[]) {
  const counts = new Map<string, number>();
  for (const customer of customers) {
    const login = normalizeLogin(customer.clientName);
    counts.set(login, (counts.get(login) ?? 0) + 1);
  }
  return new Set([...counts].filter(([, count]) => count > 1).map(([login]) => login));
}

function normalizedCompany(value: string) {
  return value.trim().toLocaleLowerCase("en-US");
}

function syntheticEmail(clientId: number) {
  return `erp-client-${clientId}@login.invalid`;
}

function safeError(error: unknown) {
  return (error instanceof Error ? error.message : "Customer sync failed.")
    .slice(0, 500)
    .replace(/[\r\n]+/g, " ");
}
