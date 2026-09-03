import "server-only";

import { Resend } from "resend";

import { resolveEmailAppBaseUrl } from "@/features/filing-signatures/app-base-url";

export async function sendQuoteConfirmationEmail(input: {
  recipient: string;
  recipientName?: string | null;
  requestId: string;
  requestNo: string;
  matter: string;
  quoteId: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) throw new Error("Resend email delivery is not configured.");

  const portalUrl = `${resolveEmailAppBaseUrl()}/requester/requests/${input.requestId}?tab=quotation`;
  const greeting = escapeHtml(input.recipientName?.trim() || "there");
  const subject = `Action required: Confirm revised quotation for ${input.requestNo}`;
  const { data, error } = await new Resend(apiKey).emails.send({
    from,
    to: [input.recipient],
    subject,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#17211b;max-width:640px;margin:auto"><p>Hi ${greeting},</p><p>Your project manager has prepared a revised quotation for <strong>${escapeHtml(input.requestNo)}</strong> — ${escapeHtml(input.matter)}.</p><p>Please review and confirm it in Pat before work can continue.</p><p style="margin:28px 0"><a href="${portalUrl}" style="background:#315d46;color:#fff;padding:12px 18px;border-radius:6px;text-decoration:none">Review quotation</a></p><p style="font-size:13px;color:#66756d">This is an automated message from Pat.</p></div>`,
    text: `Hi ${input.recipientName?.trim() || "there"},\n\nYour project manager has prepared a revised quotation for ${input.requestNo} — ${input.matter}.\n\nPlease review and confirm it in Pat before work can continue:\n${portalUrl}\n\nThis is an automated message from Pat.`,
  }, { idempotencyKey: `quote-confirmation/${input.quoteId}` });
  if (error) throw new Error(error.message);
  if (!data?.id) throw new Error("Resend did not return an email identifier.");
  return data.id;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]!);
}
