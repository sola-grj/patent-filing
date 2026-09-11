import "server-only";

import { Resend } from "resend";

import { resolveEmailAppBaseUrl } from "@/features/filing-signatures/app-base-url";

export async function sendApprovalEmail(input: {
  recipients: string[];
  subject: string;
  heading: string;
  detail: string;
  href: string;
  actionLabel: string;
  idempotencyKey: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) throw new Error("Resend email delivery is not configured.");
  const recipients = [...new Set(input.recipients.map((email) => email.trim().toLowerCase()).filter(Boolean))];
  if (!recipients.length) return;
  const url = `${resolveEmailAppBaseUrl()}${input.href}`;
  const resend = new Resend(apiKey);
  await Promise.all(recipients.map(async (recipient) => {
    const { error } = await resend.emails.send({
      from,
      to: [recipient],
      subject: input.subject,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#17211b;max-width:640px;margin:auto"><h2>${escapeHtml(input.heading)}</h2><p>${escapeHtml(input.detail)}</p><p style="margin:28px 0"><a href="${url}" style="background:#315d46;color:#fff;padding:12px 18px;border-radius:6px;text-decoration:none">${escapeHtml(input.actionLabel)}</a></p><p style="font-size:13px;color:#66756d">This is an automated message from Pat.</p></div>`,
      text: `${input.heading}\n\n${input.detail}\n\n${url}`,
    }, { idempotencyKey: `${input.idempotencyKey}/${recipient}` });
    if (error) throw new Error(error.message);
  }));
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]!);
}
