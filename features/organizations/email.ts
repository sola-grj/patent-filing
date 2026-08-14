import "server-only";

import { Resend } from "resend";

export async function sendOrganizationInvitationEmail(input: {
  email: string;
  organizationName: string;
  invitationLink: string;
  expiresAt: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !from) {
    throw new Error("Resend email delivery is not configured.");
  }

  const resend = new Resend(apiKey);
  const expires = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(input.expiresAt));
  const organizationName = escapeHtml(input.organizationName);
  const invitationLink = escapeHtml(input.invitationLink);
  const { data, error } = await resend.emails.send({
    from,
    to: [input.email],
    subject: `Invitation to join ${input.organizationName} in Pat`,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#17211b;max-width:640px;margin:auto">
      <p>You have been invited to join <strong>${organizationName}</strong> in Pat.</p>
      <p style="margin:28px 0"><a href="${invitationLink}" style="background:#315d46;color:#fff;padding:12px 18px;border-radius:6px;text-decoration:none">Accept invitation</a></p>
      <p>This invitation expires ${escapeHtml(expires)} UTC. The invitation must be accepted using this email address.</p>
      <p style="font-size:13px;color:#66756d">If you did not expect this invitation, you can ignore this message.</p>
    </div>`,
    text: `You have been invited to join ${input.organizationName} in Pat.\n\nAccept invitation: ${input.invitationLink}\n\nThis invitation expires ${expires} UTC and must be accepted using this email address.`,
  });

  if (error) throw new Error(error.message);
  if (!data?.id) throw new Error("Resend did not return an email identifier.");
  return data.id;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return entities[character];
  });
}
