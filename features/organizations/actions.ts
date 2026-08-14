"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { resolveEmailAppBaseUrl } from "@/features/filing-signatures/app-base-url";
import { requirePmContext } from "@/features/pm/server-utils";
import { getAuthenticatedUser } from "@/features/requester/server-utils";
import { createServiceClient } from "@/lib/supabase/server";

import { sendOrganizationInvitationEmail } from "./email";
import type { OrganizationActionState } from "./types";

export async function createCustomerOrganization(
  _previous: OrganizationActionState,
  formData: FormData,
): Promise<OrganizationActionState> {
  try {
    const context = await requirePmContext();
    if (context.denied || !context.isSupplierAdmin) {
      throw new Error("Only a supplier administrator can create customer organizations.");
    }

    const name = requiredText(formData, "name", "Organization name");
    const service = createServiceClient();
    const { data, error } = await service.rpc("admin_create_customer_organization", {
      organization_name: name,
      actor_user_id: context.userId,
    });
    if (error) throw new Error(error.message);

    revalidatePath("/pm/customers");
    return {
      success: true,
      message: `${name} was created with Request sharing disabled.`,
      organizationId: data as string,
    };
  } catch (error) {
    return { success: false, message: errorMessage(error) };
  }
}

export async function inviteOrganizationMember(
  _previous: OrganizationActionState,
  formData: FormData,
): Promise<OrganizationActionState> {
  const service = createServiceClient();
  let invitationId: string | null = null;

  try {
    const { userId } = await getAuthenticatedUser();
    const organizationId = requiredText(formData, "organizationId", "Organization");
    const organizationName = requiredText(formData, "organizationName", "Organization name");
    const email = requiredText(formData, "email", "Email").toLowerCase();
    const isAdmin = formData.get("isAdmin") === "on";
    const token = randomBytes(32).toString("base64url");
    const tokenHash = hashInvitationToken(token);
    const expiresAt = new Date(Date.now() + inviteTtlSeconds() * 1000).toISOString();

    const { data: invitation, error: invitationError } = await service
      .rpc("admin_create_organization_invitation", {
        target_organization_id: organizationId,
        target_email: email,
        target_token_hash: tokenHash,
        target_is_admin: isAdmin,
        target_expires_at: expiresAt,
        actor_user_id: userId,
      })
      .single();
    if (invitationError) throw new Error(invitationError.message);
    invitationId = (invitation as { id: string }).id;

    const existingUser = await findAuthUserByEmail(email);
    const invitationLink = existingUser
      ? await existingUserInvitationLink(email, token)
      : await newUserInvitationLink(email, token);

    await sendOrganizationInvitationEmail({
      email,
      organizationName,
      invitationLink,
      expiresAt,
    });

    revalidatePath("/requester/organization");
    revalidatePath(`/pm/customers/${organizationId}`);
    return {
      success: true,
      message: `Invitation sent to ${email}. The link is shown once below.`,
      invitationLink,
    };
  } catch (error) {
    if (invitationId) {
      await service
        .from("organization_invitations")
        .update({ status: "revoked", revoked_at: new Date().toISOString() })
        .eq("id", invitationId);
    }
    return { success: false, message: errorMessage(error) };
  }
}

export async function acceptOrganizationInvitation(formData: FormData) {
  const token = requiredText(formData, "token", "Invitation token");
  const isNewAccount = formData.get("newAccount") === "true";
  let failure: string | null = null;

  try {
    const { userId, email } = await getAuthenticatedUser();
    if (!email) throw new Error("Your authenticated account has no email address.");

    const service = createServiceClient();
    const { error } = await service.rpc("admin_accept_organization_invitation", {
      target_token_hash: hashInvitationToken(token),
      target_user_id: userId,
      target_email: email,
    });
    if (error) throw new Error(error.message);

    revalidatePath("/requester");
  } catch (error) {
    failure = errorMessage(error);
  }

  if (failure) {
    const params = new URLSearchParams({ token, error: failure });
    if (isNewAccount) params.set("new", "1");
    redirect(`/auth/organization-invite?${params.toString()}`);
  }

  redirect(isNewAccount ? "/auth/update-password?next=/requester" : "/requester");
}

function hashInvitationToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function newUserInvitationLink(email: string, token: string) {
  return organizationAuthLink({
    email,
    token,
    type: "invite",
    isNewAccount: true,
  });
}

async function existingUserInvitationLink(email: string, token: string) {
  return organizationAuthLink({
    email,
    token,
    type: "magiclink",
    isNewAccount: false,
  });
}

async function organizationAuthLink(input: {
  email: string;
  token: string;
  type: "invite" | "magiclink";
  isNewAccount: boolean;
}) {
  const service = createServiceClient();
  const baseUrl = resolveEmailAppBaseUrl();
  const { data, error } = await service.auth.admin.generateLink({
    type: input.type,
    email: input.email,
  });
  if (error) throw new Error(error.message);

  const authTokenHash = data.properties.hashed_token;
  if (!authTokenHash) {
    throw new Error("Supabase did not return an authentication token.");
  }

  const confirmationUrl = new URL("/auth/confirm", baseUrl);
  confirmationUrl.searchParams.set("token_hash", authTokenHash);
  confirmationUrl.searchParams.set("type", input.type);
  confirmationUrl.searchParams.set(
    "next",
    `/auth/organization-invite?token=${encodeURIComponent(input.token)}${input.isNewAccount ? "&new=1" : ""}`,
  );
  return confirmationUrl.toString();
}

async function findAuthUserByEmail(email: string) {
  const service = createServiceClient();
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    const user = data.users.find((candidate) => candidate.email?.toLowerCase() === email);
    if (user) return user;
    if (data.users.length < 1000) return null;
  }
  throw new Error("Unable to determine whether the invited account already exists.");
}

function inviteTtlSeconds() {
  const value = Number(process.env.AUTH_INVITE_TTL_SECONDS ?? "3600");
  if (!Number.isInteger(value) || value < 300 || value > 604800) {
    throw new Error("AUTH_INVITE_TTL_SECONDS must be between 300 and 604800.");
  }
  return value;
}

function requiredText(formData: FormData, name: string, label: string) {
  const value = formData.get(name);
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} is required.`);
  }
  return value.trim();
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}
