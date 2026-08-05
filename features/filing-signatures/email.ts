import "server-only";

import { Resend } from "resend";

import { resolveEmailAppBaseUrl } from "./app-base-url";
import type { FilingSignatureFile, FilingSignatureRequest } from "./types";

type SignatureEmailInput = {
  signatureRequest: FilingSignatureRequest;
  requestNo: string;
  matterName: string;
  files: FilingSignatureFile[];
  attemptNumber: number;
};

export async function sendFilingSignatureEmail(input: SignatureEmailInput) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  const recipient = input.signatureRequest.recipient_email?.trim();

  if (!apiKey || !from) {
    throw new Error("Resend email delivery is not configured.");
  }
  if (!recipient) {
    throw new Error("The requester email address is missing.");
  }

  const appBaseUrl = resolveEmailAppBaseUrl();
  const resend = new Resend(apiKey);
  const subject = `Action required: Sign filing documents for ${input.requestNo}`;
  const html = buildHtml(input, appBaseUrl);
  const text = buildText(input, appBaseUrl);
  const { data, error } = await resend.emails.send(
    {
      from,
      to: [recipient],
      subject,
      html,
      text,
    },
    {
      idempotencyKey:
        `filing-signature/${input.signatureRequest.id}/attempt-${input.attemptNumber}`,
    },
  );

  if (error) {
    throw new Error(error.message);
  }
  if (!data?.id) {
    throw new Error("Resend did not return an email identifier.");
  }

  return data.id;
}

function buildHtml(input: SignatureEmailInput, appBaseUrl: string) {
  const greeting = escapeHtml(input.signatureRequest.recipient_name?.trim() || "there");
  const dueSentence = dueText(input.signatureRequest.due_at);
  const fileList = input.files
    .map(
      (file) =>
        `<li style="margin:8px 0"><a href="${fileUrl(appBaseUrl, file.id)}">${escapeHtml(file.original_filename)}</a></li>`,
    )
    .join("");
  const note = input.signatureRequest.pm_note?.trim()
    ? `<h3 style="margin:24px 0 8px">PM note</h3><p style="white-space:pre-wrap">${escapeHtml(input.signatureRequest.pm_note)}</p>`
    : "";
  const portalUrl = `${appBaseUrl}/requester/requests/${input.signatureRequest.request_id}#signature-documents`;

  return `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#17211b;max-width:640px;margin:auto">
      <p>Hi ${greeting},</p>
      <p>Your project manager has uploaded ${input.files.length} document(s) that require your signature for filing request <strong>${escapeHtml(input.requestNo)}</strong> — ${escapeHtml(input.matterName)}.</p>
      <p>Please:</p>
      <ol>
        <li>Download and review the document(s).</li>
        <li>Sign where indicated.</li>
        <li>Upload the signed file(s) to Pat${escapeHtml(dueSentence)}.</li>
      </ol>
      <h3 style="margin:24px 0 8px">Documents</h3>
      <ul>${fileList}</ul>
      ${note}
      <p style="margin:28px 0"><a href="${portalUrl}" style="background:#315d46;color:#fff;padding:12px 18px;border-radius:6px;text-decoration:none">Review and upload signed files</a></p>
      <p style="font-size:13px;color:#66756d">For security, you will need to sign in to Pat before downloading or uploading files.</p>
      <p style="font-size:13px;color:#66756d">This is an automated message from Pat.</p>
    </div>`;
}

function buildText(input: SignatureEmailInput, appBaseUrl: string) {
  const files = input.files
    .map((file) => `- ${file.original_filename}: ${fileUrl(appBaseUrl, file.id)}`)
    .join("\n");
  const note = input.signatureRequest.pm_note?.trim()
    ? `\n\nPM note:\n${input.signatureRequest.pm_note}`
    : "";
  const portalUrl = `${appBaseUrl}/requester/requests/${input.signatureRequest.request_id}#signature-documents`;

  return `Hi ${input.signatureRequest.recipient_name?.trim() || "there"},

Your project manager has uploaded ${input.files.length} document(s) that require your signature for filing request ${input.requestNo} — ${input.matterName}.

Please:
1. Download and review the document(s).
2. Sign where indicated.
3. Upload the signed file(s) to Pat${dueText(input.signatureRequest.due_at)}.

Documents:
${files}${note}

Review and upload signed files: ${portalUrl}

For security, you will need to sign in to Pat before downloading or uploading files.

This is an automated message from Pat.`;
}

function fileUrl(appBaseUrl: string, fileId: string) {
  return `${appBaseUrl}/api/filing-signatures/files/${fileId}`;
}

function dueText(value?: string | null) {
  if (!value) {
    return "";
  }

  const date = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
  return ` by ${date}`;
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
