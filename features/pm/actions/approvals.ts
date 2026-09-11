"use server";

import { revalidatePath } from "next/cache";

import { sendApprovalEmail } from "@/features/pm/approval-email";
import { requirePmContext, toPmErrorMessage } from "@/features/pm/server-utils";
import { createServiceClient } from "@/lib/supabase/server";
import { requiredString, type ActionResult } from "@/lib/validators/requester";

type ApprovalActionData = { warning?: string };

export async function submitQuoteRevisionApproval(formData: FormData): Promise<ActionResult<ApprovalActionData>> {
  try {
    const context = await requirePmContext();
    if (context.denied || !context.isPm) throw new Error("Only a PM can submit quotation changes.");
    const quoteId = requiredString(formData.get("quoteId"), "Quotation");
    const { data: approvalId, error } = await context.supabase.rpc("submit_quote_revision_for_approval", { p_quote_id: quoteId });
    if (error) throw new Error(error.message);
    const warning = await emailApprovers(String(approvalId));
    revalidateApprovalPaths();
    return { success: true, data: warning ? { warning } : {} };
  } catch (error) {
    return { success: false, error: toPmErrorMessage(error) };
  }
}

export async function reviewQuoteRevisionApproval(formData: FormData): Promise<ActionResult<ApprovalActionData>> {
  try {
    const context = await requirePmContext();
    if (context.denied || !context.isSupplierAdmin) throw new Error("PM administrator access required.");
    const approvalId = requiredString(formData.get("approvalId"), "Approval");
    const decision = requiredString(formData.get("decision"), "Decision");
    const reason = typeof formData.get("reason") === "string" ? String(formData.get("reason")).trim() : "";
    const { data, error } = await context.supabase.rpc("review_quote_revision_approval", {
      p_approval_id: approvalId,
      p_decision: decision,
      p_reason: reason || null,
    });
    if (error) throw new Error(error.message);
    const approval = data as { request_id: string; submitted_by: string; status: string };
    const warning = await emailSubmitter(approvalId, approval);
    revalidateApprovalPaths(approval.request_id, approvalId);
    return { success: true, data: warning ? { warning } : {} };
  } catch (error) {
    return { success: false, error: toPmErrorMessage(error) };
  }
}

async function emailApprovers(approvalId: string) {
  try {
    const service = createServiceClient();
    const { data: approval, error } = await service
      .from("approval_requests")
      .select("supplier_organization_id, request_id, translation_requests(request_no)")
      .eq("id", approvalId)
      .single();
    if (error) throw error;
    const [{ data: members }, { data: superAdmins }] = await Promise.all([
      service.from("organization_members").select("user_id").eq("organization_id", approval.supplier_organization_id).eq("role", "pm_admin"),
      service.from("profiles").select("user_id").eq("platform_role", "super_admin"),
    ]);
    const userIds = [...new Set([...(members ?? []), ...(superAdmins ?? [])].map((row) => row.user_id))];
    const { data: profiles } = userIds.length
      ? await service.from("profiles").select("email").in("user_id", userIds)
      : { data: [] };
    const request = first(approval.translation_requests);
    await sendApprovalEmail({
      recipients: (profiles ?? []).map((profile) => profile.email).filter((email): email is string => Boolean(email)),
      subject: `Quotation change approval required: ${request?.request_no ?? "Request"}`,
      heading: "Quotation change approval required",
      detail: `A PM submitted a quotation change for ${request?.request_no ?? "a Request"}.`,
      href: "/pm/approvals",
      actionLabel: "Review approval",
      idempotencyKey: `quote-revision-approval/${approvalId}/submitted`,
    });
    return undefined;
  } catch (error) {
    return `Approval was submitted, but email delivery failed: ${toPmErrorMessage(error)}`;
  }
}

async function emailSubmitter(approvalId: string, approval: { request_id: string; submitted_by: string; status: string }) {
  try {
    const service = createServiceClient();
    const [{ data: profile }, { data: request }] = await Promise.all([
      service.from("profiles").select("email").eq("user_id", approval.submitted_by).single(),
      service.from("translation_requests").select("request_no").eq("id", approval.request_id).single(),
    ]);
    await sendApprovalEmail({
      recipients: profile?.email ? [profile.email] : [],
      subject: `Quotation change ${approval.status}: ${request?.request_no ?? "Request"}`,
      heading: `Quotation change ${approval.status}`,
      detail: approval.status === "approved" ? "The quotation change is approved and ready to send." : "The quotation change was rejected. Review the reason and revise it before resubmitting.",
      href: `/pm/${approval.request_id}`,
      actionLabel: "Open Request",
      idempotencyKey: `quote-revision-approval/${approvalId}/${approval.status}`,
    });
    return undefined;
  } catch (error) {
    return `The decision was saved, but email delivery failed: ${toPmErrorMessage(error)}`;
  }
}

function revalidateApprovalPaths(requestId?: string, approvalId?: string) {
  revalidatePath("/pm/approvals");
  if (approvalId) revalidatePath(`/pm/approvals/${approvalId}`);
  if (requestId) revalidatePath(`/pm/${requestId}`);
}

function first<T>(value: T | T[] | null): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}
