"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  optionalNumber,
  optionalString,
  requiredString,
  type ActionResult,
} from "@/lib/validators/requester";
import {
  nextVersion,
  sumParseMetric,
  writeRequestEvent,
} from "@/features/requester/actions/helpers";
import { safeFileName } from "@/features/requester/server-utils";

import { requirePmContext, toPmErrorMessage } from "./server-utils";

type SupabaseClient = Awaited<ReturnType<typeof requirePmContext>>["supabase"];
type QuoteSeed = {
  amount: number;
  currency: string;
  estimatedDeliveryAt: string | null;
  notes: string | null;
  source: string;
};

export async function generatePmQuote(formData: FormData): Promise<ActionResult> {
  let redirectTo: string | null = null;

  try {
    const context = await assertPm();
    const requestId = requiredString(formData.get("requestId"), "Request");
    const amount = requiredAmount(formData.get("amount"), "Quote amount");
    const currency = optionalString(formData.get("currency")) ?? "USD";
    const estimatedDeliveryAt = optionalString(formData.get("estimatedDeliveryAt"));
    const notes = optionalString(formData.get("notes"));

    await createPmQuote(context.supabase, requestId, {
      amount,
      currency,
      estimatedDeliveryAt,
      notes,
      source: "pm_initial",
    });
    await context.supabase
      .from("translation_requests")
      .update({
        workflow_stage: "quoted",
        requester_status: "responding",
        pm_status: "responding",
      })
      .eq("id", requestId);
    await writeRequestEvent(
      context.supabase,
      requestId,
      context.userId,
      "quote.generated.pm",
      "configured",
      "quoted",
      { amount, currency },
    );

    revalidatePmRequest(requestId);
    redirectTo = `/pm/requests/${requestId}`;
  } catch (error) {
    return { success: false, error: toPmErrorMessage(error) };
  }

  if (redirectTo) {
    redirect(redirectTo);
  }
  return { success: true };
}

export async function startNegotiationFromPm(formData: FormData): Promise<ActionResult> {
  let redirectTo: string | null = null;

  try {
    const context = await assertPm();
    const requestId = requiredString(formData.get("requestId"), "Request");
    const quoteId = requiredString(formData.get("quoteId"), "Quote");
    const input = parsePmNegotiationInput(formData);
    const { data: quote, error: quoteError } = await context.supabase
      .from("quotes")
      .select("id, request_id")
      .eq("id", quoteId)
      .single();

    if (quoteError) {
      throw new Error(quoteError.message);
    }
    if (quote.request_id !== requestId) {
      throw new Error("Quote does not belong to this request.");
    }

    await closeOpenNegotiations(context.supabase, requestId);
    await context.supabase
      .from("quotes")
      .update({ status: "negotiating" })
      .eq("id", quoteId);

    const { data: negotiation, error: negotiationError } = await context.supabase
      .from("quote_negotiations")
      .insert({
        request_id: requestId,
        quote_id: quoteId,
        initiated_by: context.userId,
        expected_amount: input.expectedAmount,
        expected_delivery_at: input.expectedDeliveryAt,
        adjustment_notes: input.adjustmentNotes,
        status: "open",
      })
      .select("id")
      .single();

    if (negotiationError) {
      throw new Error(negotiationError.message);
    }

    await context.supabase.from("quote_negotiation_messages").insert({
      negotiation_id: negotiation.id,
      author_id: context.userId,
      body: input.adjustmentNotes ?? "PM requested quote adjustments.",
      expected_amount: input.expectedAmount,
      expected_delivery_at: input.expectedDeliveryAt,
      adjustment_notes: input.adjustmentNotes,
    });
    await context.supabase
      .from("translation_requests")
      .update({
        workflow_stage: "negotiation",
        requester_status: "negotiation",
        pm_status: "negotiation",
      })
      .eq("id", requestId);
    await writeRequestEvent(
      context.supabase,
      requestId,
      context.userId,
      "quote.negotiation.started.pm",
      "quoted",
      "negotiation",
      {
        quoteId,
        expectedAmount: input.expectedAmount,
        expectedDeliveryAt: input.expectedDeliveryAt,
      },
    );

    revalidatePmRequest(requestId);
    redirectTo = `/pm/requests/${requestId}`;
  } catch (error) {
    return { success: false, error: toPmErrorMessage(error) };
  }

  if (redirectTo) {
    redirect(redirectTo);
  }
  return { success: true };
}

export async function respondToNegotiation(formData: FormData): Promise<ActionResult> {
  let redirectTo: string | null = null;

  try {
    const context = await assertPm();
    const requestId = requiredString(formData.get("requestId"), "Request");
    const negotiationId = requiredString(formData.get("negotiationId"), "Negotiation");
    const decision = requiredString(formData.get("decision"), "Decision");
    const message = optionalString(formData.get("message")) ?? "PM response submitted.";
    const amount = optionalNumber(formData.get("amount"));
    const estimatedDeliveryAt = optionalString(formData.get("estimatedDeliveryAt"));
    const currency = optionalString(formData.get("currency")) ?? "USD";

    const { data: negotiation, error } = await context.supabase
      .from("quote_negotiations")
      .select("id, request_id, quote_id, expected_amount, expected_delivery_at")
      .eq("id", negotiationId)
      .single();

    if (error) throw new Error(error.message);
    if (negotiation.request_id !== requestId) {
      throw new Error("Negotiation does not belong to this request.");
    }

    if (decision !== "accept" && decision !== "counter") {
      throw new Error("Decision must be accept or counter.");
    }

    const responseAmount =
      decision === "accept"
        ? Number(negotiation.expected_amount ?? amount)
        : Number(amount);
    if (!Number.isFinite(responseAmount) || responseAmount < 0) {
      throw new Error("Response quote amount is required.");
    }

    const responseDeliveryAt =
      decision === "accept"
        ? estimatedDeliveryAt ?? negotiation.expected_delivery_at ?? null
        : estimatedDeliveryAt ?? null;
    const responseQuote = await createPmQuote(context.supabase, requestId, {
      amount: responseAmount,
      currency,
      estimatedDeliveryAt: responseDeliveryAt,
      notes: message,
      source: decision === "accept" ? "pm_accept_negotiation" : "pm_counter",
    });

    if (negotiation.quote_id) {
      await context.supabase
        .from("quotes")
        .update({ status: "superseded" })
        .eq("id", negotiation.quote_id);
    }

    if (decision === "accept") {
      await context.supabase
        .from("quotes")
        .update({ status: "superseded" })
        .eq("request_id", requestId)
        .eq("status", "accepted")
        .neq("id", responseQuote.id);

      await context.supabase
        .from("quotes")
        .update({ status: "accepted" })
        .eq("id", responseQuote.id);
    }

    await context.supabase.from("quote_negotiation_messages").insert({
      negotiation_id: negotiationId,
      author_id: context.userId,
      body: message,
      expected_amount: responseAmount,
      expected_delivery_at: responseDeliveryAt,
      adjustment_notes: message,
    });
    await context.supabase
      .from("quote_negotiations")
      .update({
        pm_decision: decision === "accept" ? "reasonable" : "countered",
        status: decision === "accept" ? "accepted" : "countered",
        response_quote_id: responseQuote.id,
      })
      .eq("id", negotiationId);
    await context.supabase
      .from("translation_requests")
      .update({
        workflow_stage: decision === "accept" ? "order_pending" : "negotiation",
        requester_status: decision === "accept" ? "in_progress" : "negotiation",
        pm_status: decision === "accept" ? "in_progress" : "negotiation",
      })
      .eq("id", requestId);
    await writeRequestEvent(
      context.supabase,
      requestId,
      context.userId,
      "quote.negotiation.responded.pm",
      "negotiation",
      decision === "accept" ? "order_pending" : "negotiation",
      { decision, responseQuoteId: responseQuote.id },
    );

    revalidatePmRequest(requestId);
    redirectTo = `/pm/requests/${requestId}`;
  } catch (error) {
    return { success: false, error: toPmErrorMessage(error) };
  }

  if (redirectTo) {
    redirect(redirectTo);
  }
  return { success: true };
}

export async function closeRequestFromPm(formData: FormData): Promise<ActionResult> {
  let redirectTo: string | null = null;

  try {
    const context = await assertPm();
    const requestId = requiredString(formData.get("requestId"), "Request");
    const reason = requiredString(formData.get("reason"), "Reason");

    await context.supabase
      .from("translation_requests")
      .update({
        workflow_stage: "closed",
        requester_status: "rejected",
        pm_status: "rejected",
        closed_at: new Date().toISOString(),
      })
      .eq("id", requestId);
    await writeRequestEvent(
      context.supabase,
      requestId,
      context.userId,
      "request.closed.pm",
      null,
      "closed",
      { reason },
    );

    revalidatePmRequest(requestId);
    redirectTo = "/pm/requests";
  } catch (error) {
    return { success: false, error: toPmErrorMessage(error) };
  }

  if (redirectTo) {
    redirect(redirectTo);
  }
  return { success: true };
}

export async function submitCloseRequestFromPm(formData: FormData): Promise<void> {
  const result = await closeRequestFromPm(formData);

  if (!result.success) {
    throw new Error(result.error ?? "Failed to close request.");
  }
}

export async function confirmOrderFromPm(formData: FormData): Promise<ActionResult> {
  let redirectTo: string | null = null;

  try {
    const context = await assertPm();
    const requestId = requiredString(formData.get("requestId"), "Request");
    const orderId = requiredString(formData.get("orderId"), "Order");
    const now = new Date().toISOString();

    await context.supabase
      .from("orders")
      .update({
        offline_confirmation_status: "confirmed",
        confirmed_at: now,
      })
      .eq("id", orderId);
    await writeRequestEvent(
      context.supabase,
      requestId,
      context.userId,
      "order.confirmed.pm",
      "order_pending",
      "order_pending",
      { orderId },
    );

    revalidatePmRequest(requestId);
    redirectTo = `/pm/requests/${requestId}`;
  } catch (error) {
    return { success: false, error: toPmErrorMessage(error) };
  }

  if (redirectTo) {
    redirect(redirectTo);
  }
  return { success: true };
}

export async function startProductionFromPm(formData: FormData): Promise<ActionResult> {
  let redirectTo: string | null = null;

  try {
    const context = await assertPm();
    const requestId = requiredString(formData.get("requestId"), "Request");
    const orderId = requiredString(formData.get("orderId"), "Order");
    const now = new Date().toISOString();

    await context.supabase
      .from("orders")
      .update({
        status: "in_progress",
        offline_confirmation_status: "confirmed",
        confirmed_at: now,
        started_at: now,
      })
      .eq("id", orderId);
    await context.supabase
      .from("translation_requests")
      .update({
        workflow_stage: "production",
        requester_status: "in_progress",
        pm_status: "in_progress",
      })
      .eq("id", requestId);
    await writeRequestEvent(
      context.supabase,
      requestId,
      context.userId,
      "order.started.pm",
      "order_pending",
      "production",
      { orderId },
    );

    revalidatePmRequest(requestId);
    redirectTo = `/pm/requests/${requestId}`;
  } catch (error) {
    return { success: false, error: toPmErrorMessage(error) };
  }

  if (redirectTo) {
    redirect(redirectTo);
  }
  return { success: true };
}

export async function startTranslationTaskFromPm(
  formData: FormData,
): Promise<ActionResult<{ orderId: string }>> {
  try {
    const context = await assertPm();
    const requestId = requiredString(formData.get("requestId"), "Request");
    const translatorId = requiredString(formData.get("translatorId"), "Translator");
    const now = new Date().toISOString();

    const { data: request, error: requestError } = await context.supabase
      .from("translation_requests")
      .select("id, workflow_stage, organization_id, requester_id, pm_status")
      .eq("id", requestId)
      .single();
    if (requestError) throw new Error(requestError.message);
    if (request.pm_status !== "responding" && request.pm_status !== "in_progress") {
      throw new Error("Tasks can only start after the quote is accepted.");
    }

    const { data: acceptedQuote, error: acceptedQuoteError } = await context.supabase
      .from("quotes")
      .select("id, version_no")
      .eq("request_id", requestId)
      .eq("status", "accepted")
      .order("version_no", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (acceptedQuoteError) throw new Error(acceptedQuoteError.message);
    if (!acceptedQuote) {
      throw new Error("An accepted quote is required before starting tasks.");
    }

    const order = await getOrCreateStartedOrder(context.supabase, {
      acceptedQuoteId: acceptedQuote.id,
      organizationId: request.organization_id,
      requestId,
      requesterId: request.requester_id,
      startedAt: now,
    });

    const { data: orderStatusRow, error: orderStatusError } = await context.supabase
      .from("orders")
      .select("id, status")
      .eq("id", order.id)
      .single();
    if (orderStatusError) throw new Error(orderStatusError.message);
    if (orderStatusRow.status === "completed") {
      throw new Error("Completed tasks cannot be reassigned or restarted.");
    }

    const { data: translatorMembership, error: translatorError } = await context.supabase
      .from("organization_members")
      .select("id")
      .eq("user_id", translatorId)
      .eq("role", "translator")
      .limit(1)
      .maybeSingle();
    if (translatorError) throw new Error(translatorError.message);
    if (!translatorMembership) {
      throw new Error("Selected translator is not available.");
    }

    const { data: files, error: filesError } = await context.supabase
      .from("request_files")
      .select("id")
      .eq("request_id", requestId)
      .eq("confirmed_for_translation", true)
      .order("created_at", { ascending: true });
    if (filesError) throw new Error(filesError.message);
    if (!(files ?? []).length) {
      throw new Error("No confirmed files are available for task assignment.");
    }

    const { data: existingTasks, error: taskError } = await context.supabase
      .from("translation_tasks")
      .select("id, request_file_id, status")
      .eq("order_id", order.id)
      .eq("task_type", "translation");
    if (taskError) throw new Error(taskError.message);

    if ((existingTasks ?? []).some((task) => task.status === "completed")) {
      throw new Error("Completed tasks cannot be reassigned or restarted.");
    }

    const existingTaskByFileId = new Map(
      (existingTasks ?? [])
        .filter((task) => task.request_file_id)
        .map((task) => [task.request_file_id as string, task.id]),
    );

    const insertPayload = (files ?? [])
      .filter((file) => !existingTaskByFileId.has(file.id))
      .map((file) => ({
        order_id: order.id,
        request_file_id: file.id,
        assigned_pm_id: context.userId,
        assigned_translator_id: translatorId,
        task_type: "translation" as const,
        status: "in_progress" as const,
        started_at: now,
      }));

    if (insertPayload.length) {
      const { error: insertError } = await context.supabase
        .from("translation_tasks")
        .insert(insertPayload);
      if (insertError) throw new Error(insertError.message);
    }

    for (const file of files ?? []) {
      const taskId = existingTaskByFileId.get(file.id);
      if (!taskId) {
        continue;
      }

      const { error: updateTaskError } = await context.supabase
        .from("translation_tasks")
        .update({
          assigned_pm_id: context.userId,
          assigned_translator_id: translatorId,
          status: "in_progress",
          started_at: now,
        })
        .eq("id", taskId);
      if (updateTaskError) throw new Error(updateTaskError.message);
    }

    await context.supabase
      .from("orders")
      .update({
        accepted_quote_id: acceptedQuote.id,
        status: "in_progress",
        offline_confirmation_status: "confirmed",
        confirmed_at: order.confirmed_at ?? now,
        started_at: now,
      })
      .eq("id", order.id);
    await context.supabase
      .from("translation_requests")
      .update({
        workflow_stage: "production",
        requester_status: "in_progress",
        pm_status: "in_progress",
      })
      .eq("id", requestId);
    await writeRequestEvent(
      context.supabase,
      requestId,
      context.userId,
      "order.started.pm",
      request.workflow_stage,
      "production",
      {
        orderId: order.id,
        translatorId,
        taskCount: files?.length ?? 0,
      },
    );

    revalidatePmRequest(requestId);
    revalidatePath(`/requester/orders/${order.id}`);
    revalidatePath("/requester/orders");
    return { success: true, data: { orderId: order.id } };
  } catch (error) {
    return { success: false, error: toPmErrorMessage(error) };
  }
}

export async function uploadPmDeliverableZip(
  formData: FormData,
): Promise<ActionResult<{ deliverableId: string }>> {
  try {
    const context = await assertPm();
    const requestId = requiredString(formData.get("requestId"), "Request");
    const orderId = requiredString(formData.get("orderId"), "Order");
    const upload = formData.get("deliverableZip");

    if (!(upload instanceof File)) {
      throw new Error("Please choose a ZIP file to upload.");
    }

    validateDeliverableZip(upload);

    const { data: order, error: orderError } = await context.supabase
      .from("orders")
      .select("id, request_id, status, translation_tasks(id, task_type)")
      .eq("id", orderId)
      .single();
    if (orderError) throw new Error(orderError.message);
    if (order.request_id !== requestId) {
      throw new Error("Order does not belong to this request.");
    }
    if (order.status === "completed") {
      throw new Error("This order has already been delivered.");
    }

    const { data: requirement, error: requirementError } = await context.supabase
      .from("translation_requirements")
      .select("target_language")
      .eq("request_id", requestId)
      .maybeSingle();
    if (requirementError) throw new Error(requirementError.message);

    const tasks = ((order.translation_tasks ?? []) as Array<{ id: string; task_type?: string | null }>)
      .filter((task) => task.task_type === "translation");
    const targetTask = tasks[0];
    if (!targetTask) {
      throw new Error("Start the translation task before uploading a deliverable.");
    }

    const { data: existingDeliverables, error: deliverableError } = await context.supabase
      .from("task_deliverables")
      .select("id, storage_path, version_no, status")
      .eq("task_id", targetTask.id)
      .order("version_no", { ascending: false });
    if (deliverableError) throw new Error(deliverableError.message);

    const draftDeliverable = (existingDeliverables ?? []).find((item) => item.status === "draft") ?? null;
    const nextVersion = Number(existingDeliverables?.[0]?.version_no ?? 0) + 1;
    const storagePath = `deliverables/${orderId}/${Date.now()}-${safeFileName(upload.name)}`;
    const bytes = new Uint8Array(await upload.arrayBuffer());

    const contentType = resolveDeliverableZipContentType(upload);

    const { error: uploadError } = await context.supabase.storage
      .from("request-files")
      .upload(storagePath, bytes, { contentType, upsert: false });
    if (uploadError) throw new Error(uploadError.message);

    let deliverableId: string;
    if (draftDeliverable) {
      if (draftDeliverable.storage_path !== storagePath) {
        await context.supabase.storage.from("request-files").remove([draftDeliverable.storage_path]);
      }

      const { data: updatedDeliverable, error: updateError } = await context.supabase
        .from("task_deliverables")
        .update({
          storage_bucket: "request-files",
          storage_path: storagePath,
          language: requirement?.target_language ?? null,
          submitted_by: context.userId,
        })
        .eq("id", draftDeliverable.id)
        .select("id")
        .single();
      if (updateError) throw new Error(updateError.message);
      deliverableId = updatedDeliverable.id;
    } else {
      const { data: createdDeliverable, error: createError } = await context.supabase
        .from("task_deliverables")
        .insert({
          task_id: targetTask.id,
          storage_bucket: "request-files",
          storage_path: storagePath,
          version_no: nextVersion,
          language: requirement?.target_language ?? null,
          submitted_by: context.userId,
          status: "draft",
        })
        .select("id")
        .single();
      if (createError) throw new Error(createError.message);
      deliverableId = createdDeliverable.id;
    }

    revalidatePmRequest(requestId);
    revalidatePath(`/requester/orders/${orderId}`);
    return { success: true, data: { deliverableId } };
  } catch (error) {
    return { success: false, error: toPmErrorMessage(error) };
  }
}

export async function deliverPmOrder(
  formData: FormData,
): Promise<ActionResult> {
  try {
    const context = await assertPm();
    const requestId = requiredString(formData.get("requestId"), "Request");
    const orderId = requiredString(formData.get("orderId"), "Order");
    const now = new Date().toISOString();

    const { data: order, error: orderError } = await context.supabase
      .from("orders")
      .select("id, request_id, status, translation_tasks(id, status, task_deliverables(id, status))")
      .eq("id", orderId)
      .single();
    if (orderError) throw new Error(orderError.message);
    if (order.request_id !== requestId) {
      throw new Error("Order does not belong to this request.");
    }
    if (order.status === "completed") {
      throw new Error("This order has already been delivered.");
    }

    const tasks = (order.translation_tasks ?? []) as Array<{
      id: string;
      status?: string | null;
      task_deliverables?: Array<{ id: string; status?: string | null }> | null;
    }>;
    const draftDeliverableIds = tasks.flatMap((task) =>
      (task.task_deliverables ?? [])
        .filter((deliverable) => deliverable.status === "draft")
        .map((deliverable) => deliverable.id),
    );

    if (!draftDeliverableIds.length) {
      throw new Error("Upload a translated ZIP before delivering it to the requester.");
    }

    const { error: deliverableUpdateError } = await context.supabase
      .from("task_deliverables")
      .update({ status: "submitted" })
      .in("id", draftDeliverableIds);
    if (deliverableUpdateError) throw new Error(deliverableUpdateError.message);

    const taskIds = tasks.map((task) => task.id);
    if (taskIds.length) {
      const { error: taskUpdateError } = await context.supabase
        .from("translation_tasks")
        .update({ status: "completed", completed_at: now })
        .in("id", taskIds);
      if (taskUpdateError) throw new Error(taskUpdateError.message);
    }

    const { error: orderUpdateError } = await context.supabase
      .from("orders")
      .update({ status: "completed", completed_at: now })
      .eq("id", orderId);
    if (orderUpdateError) throw new Error(orderUpdateError.message);

    const { error: requestUpdateError } = await context.supabase
      .from("translation_requests")
      .update({
        workflow_stage: "completed",
        requester_status: "completed",
        pm_status: "completed",
      })
      .eq("id", requestId);
    if (requestUpdateError) throw new Error(requestUpdateError.message);

    await writeRequestEvent(
      context.supabase,
      requestId,
      context.userId,
      "deliverables.submitted.pm",
      "production",
      "completed",
      { orderId, deliverableCount: draftDeliverableIds.length },
    );

    revalidatePmRequest(requestId);
    revalidatePath(`/requester/orders/${orderId}`);
    revalidatePath("/requester/orders");
    return { success: true };
  } catch (error) {
    return { success: false, error: toPmErrorMessage(error) };
  }
}

async function assertPm() {
  const context = await requirePmContext();

  if (context.denied) {
    throw new Error("You do not have permission to access the PM workspace.");
  }

  return context;
}

async function createPmQuote(
  supabase: SupabaseClient,
  requestId: string,
  seed: QuoteSeed,
) {
  const { data: files } = await supabase
    .from("request_files")
    .select("id, file_parse_results(word_count, page_count, claim_count, technical_fields)")
    .eq("request_id", requestId)
    .eq("confirmed_for_translation", true);
  const wordCount = sumParseMetric(files ?? [], "word_count");
  const versionNo = await nextVersion(supabase, "quotes", requestId);
  const { data: quote, error } = await supabase
    .from("quotes")
    .insert({
      request_id: requestId,
      version_no: versionNo,
      status: "generated",
      currency: seed.currency,
      total_amount: seed.amount,
      estimated_delivery_at: seed.estimatedDeliveryAt,
      valid_until: new Date(Date.now() + 7 * 86400000).toISOString(),
      notes: seed.notes,
      pricing_snapshot: { source: seed.source, wordCount },
      breakdown_json: { source: seed.source, manualAmount: seed.amount },
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  await supabase.from("quote_items").insert({
    quote_id: quote.id,
    label: "Patent translation service",
    amount: seed.amount,
    quantity: wordCount || null,
    unit: wordCount ? "word" : "project",
    description: seed.notes,
  });
  await supabase.from("quote_factor_snapshots").insert({
    quote_id: quote.id,
    factors: {
      source: seed.source,
      wordCount,
      manualAmount: seed.amount,
    },
  });

  return quote;
}

function requiredAmount(value: FormDataEntryValue | null, label: string) {
  const amount = optionalNumber(value);

  if (amount == null || amount < 0) {
    throw new Error(`${label} is required.`);
  }

  return amount;
}

function parsePmNegotiationInput(formData: FormData) {
  const input = {
    expectedAmount: optionalNumber(formData.get("expectedAmount")),
    expectedDeliveryAt: optionalString(formData.get("expectedDeliveryAt")),
    adjustmentNotes: optionalString(formData.get("adjustmentNotes")),
  };

  if (
    input.expectedAmount == null &&
    !input.expectedDeliveryAt &&
    !input.adjustmentNotes
  ) {
    throw new Error("Provide target price, delivery date, or negotiation notes.");
  }

  return input;
}

async function closeOpenNegotiations(
  supabase: SupabaseClient,
  requestId: string,
) {
  const { error } = await supabase
    .from("quote_negotiations")
    .update({ status: "closed" })
    .eq("request_id", requestId)
    .eq("status", "open");

  if (error) {
    throw new Error(error.message);
  }
}

async function getOrCreateStartedOrder(
  supabase: SupabaseClient,
  input: {
    acceptedQuoteId: string;
    organizationId: string;
    requestId: string;
    requesterId: string;
    startedAt: string;
  },
) {
  const { data: existingOrder, error: existingOrderError } = await supabase
    .from("orders")
    .select("id, confirmed_at")
    .eq("request_id", input.requestId)
    .maybeSingle();

  if (existingOrderError) {
    throw new Error(existingOrderError.message);
  }

  if (existingOrder) {
    return existingOrder;
  }

  const { data: isStaff, error: staffCheckError } = await supabase.rpc("is_platform_staff");
  if (staffCheckError) {
    throw new Error(staffCheckError.message);
  }
  if (!isStaff) {
    throw new Error(
      "Order creation requires the current user to have a PM, ops, or admin organization_members role.",
    );
  }

  const orderId = crypto.randomUUID();
  const { error: createOrderError } = await supabase
    .from("orders")
    .insert({
      id: orderId,
      request_id: input.requestId,
      accepted_quote_id: input.acceptedQuoteId,
      organization_id: input.organizationId,
      requester_id: input.requesterId,
      status: "in_progress",
      offline_confirmation_status: "confirmed",
      confirmed_at: input.startedAt,
      started_at: input.startedAt,
    });

  if (createOrderError) {
    const details =
      [createOrderError.code, createOrderError.message, createOrderError.details, createOrderError.hint]
        .filter(Boolean)
        .join(" | ");
    throw new Error(details || "Order creation failed.");
  }

  return {
    id: orderId,
    confirmed_at: input.startedAt,
  };
}

function revalidatePmRequest(requestId: string) {
  revalidatePath("/pm");
  revalidatePath("/pm/requests");
  revalidatePath(`/pm/requests/${requestId}`);
  revalidatePath("/requester");
  revalidatePath("/requester/requests");
  revalidatePath(`/requester/requests/${requestId}`);
  revalidatePath(`/requester/requests/${requestId}/quote`);
  revalidatePath(`/requester/orders`);
}

function validateDeliverableZip(file: File) {
  const lowerName = file.name.toLowerCase();
  const isZip =
    lowerName.endsWith(".zip") ||
    file.type === "application/zip" ||
    file.type === "application/x-zip-compressed";

  if (!file.size) {
    throw new Error("Please choose a ZIP file to upload.");
  }

  if (!isZip) {
    throw new Error("Only ZIP deliverables are supported.");
  }
}

function resolveDeliverableZipContentType(file: File) {
  const lowerName = file.name.toLowerCase();

  if (
    lowerName.endsWith(".zip") ||
    file.type === "application/zip" ||
    file.type === "application/x-zip-compressed"
  ) {
    return "application/zip";
  }

  return file.type || "application/octet-stream";
}
