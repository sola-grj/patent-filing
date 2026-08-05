"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MailWarning, Send } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileUploadDropzone } from "@/components/ui/file-upload-dropzone";
import {
  cancelPmSignatureRequest,
  removePmSignatureFile,
  retryPmSignatureEmail,
  savePmSignatureDraft,
  sendPmSignatureRequest,
} from "@/features/filing-signatures/pm-actions";
import type { FilingSignatureRequest } from "@/features/filing-signatures/types";
import { signatureFilesByDirection } from "@/features/filing-signatures/types";

import { SignatureFileLinks, SignatureZipLink } from "./signature-file-links";
import { SignatureHistory } from "./signature-history";

type PanelActionResult = {
  success: boolean;
  error?: string;
  data?: unknown;
};

export function PmSignaturePanel({
  canManage,
  requestId,
  signatureRequests,
}: {
  canManage: boolean;
  requestId: string;
  signatureRequests: FilingSignatureRequest[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [files, setFiles] = useState<File[]>([]);
  const [inputKey, setInputKey] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const sorted = useMemo(
    () => [...signatureRequests].sort(newestFirst),
    [signatureRequests],
  );
  const active = sorted.find((request) => ["draft", "sent"].includes(request.status));
  const history = sorted.filter((request) => request.id !== active?.id);
  const [pmNote, setPmNote] = useState(active?.status === "draft" ? active.pm_note ?? "" : "");
  const [dueAt, setDueAt] = useState(active?.status === "draft" ? active.due_at ?? "" : "");

  function run(action: () => Promise<PanelActionResult>) {
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      if (!result.success) {
        setMessage(result.error ?? "The signature request could not be updated.");
        return;
      }
      setMessage(actionWarning(result.data));
      setFiles([]);
      setInputKey((value) => value + 1);
      router.refresh();
    });
  }

  function saveDraft() {
    const formData = new FormData();
    formData.set("requestId", requestId);
    formData.set("pmNote", pmNote);
    formData.set("dueAt", dueAt);
    files.forEach((file) => formData.append("files", file));
    run(() => savePmSignatureDraft(formData));
  }

  function runForRequest(
    action: (formData: FormData) => Promise<PanelActionResult>,
    signatureRequestId: string,
  ) {
    const formData = new FormData();
    formData.set("signatureRequestId", signatureRequestId);
    run(() => action(formData));
  }

  return (
    <Card id="signature-documents">
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <div>
          <CardTitle>Signature documents</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Send POA or filing forms to the requester and receive signed files.
          </p>
        </div>
        {active ? <Badge variant="outline">{statusLabel(active.status)}</Badge> : null}
      </CardHeader>
      <CardContent className="space-y-6">
        {active?.status === "sent" ? (
          <PendingPackage
            disabled={isPending}
            request={active}
            onCancel={() => runForRequest(cancelPmSignatureRequest, active.id)}
            onRetry={() => runForRequest(retryPmSignatureEmail, active.id)}
          />
        ) : canManage ? (
          <DraftEditor
            active={active?.status === "draft" ? active : null}
            disabled={isPending}
            dueAt={dueAt}
            files={files}
            inputKey={inputKey}
            pmNote={pmNote}
            onCancel={active ? () => runForRequest(cancelPmSignatureRequest, active.id) : undefined}
            onDueAtChange={setDueAt}
            onFileChange={setFiles}
            onNoteChange={setPmNote}
            onRemove={(fileId) => {
              const formData = new FormData();
              formData.set("fileId", fileId);
              run(() => removePmSignatureFile(formData));
            }}
            onSave={saveDraft}
            onSend={active ? () => runForRequest(sendPmSignatureRequest, active.id) : undefined}
          />
        ) : (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            New signature packages can only be created while this Filing request is In progress.
          </p>
        )}

        {message ? (
          <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            {message}
          </p>
        ) : null}
        <SignatureHistory requests={history} viewer="pm" />
      </CardContent>
    </Card>
  );
}

function DraftEditor({
  active,
  disabled,
  dueAt,
  files,
  inputKey,
  pmNote,
  onCancel,
  onDueAtChange,
  onFileChange,
  onNoteChange,
  onRemove,
  onSave,
  onSend,
}: {
  active: FilingSignatureRequest | null;
  disabled: boolean;
  dueAt: string;
  files: File[];
  inputKey: number;
  pmNote: string;
  onCancel?: () => void;
  onDueAtChange: (value: string) => void;
  onFileChange: (files: File[]) => void;
  onNoteChange: (value: string) => void;
  onRemove: (fileId: string) => void;
  onSave: () => void;
  onSend?: () => void;
}) {
  const sourceFiles = active ? signatureFilesByDirection(active, "pm_to_requester") : [];
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <FileUploadDropzone
          accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.zip"
          disabled={disabled}
          inputKey={inputKey}
          label="Upload signature documents"
          onFilesChange={onFileChange}
        />
        <p className="text-xs text-muted-foreground">
          PDF, DOC, DOCX, JPG, PNG, or ZIP · up to 10 files · 100 MB total
        </p>
        <p className="text-xs text-muted-foreground">
          {files.length
            ? `${files.length} new file(s) selected`
            : "No new files selected yet."}
        </p>
      </div>
      <label className="space-y-2 text-sm">
        <span className="font-medium">Message to requester (optional)</span>
        <textarea
          className="min-h-24 w-full rounded-md border bg-background px-3 py-2"
          disabled={disabled}
          maxLength={2000}
          value={pmNote}
          onChange={(event) => onNoteChange(event.target.value)}
        />
      </label>
      <label className="block max-w-sm space-y-2 text-sm">
        <span className="font-medium">Signature due date (optional)</span>
        <input
          className="h-10 w-full rounded-md border bg-background px-3"
          disabled={disabled}
          type="date"
          value={dueAt}
          onChange={(event) => onDueAtChange(event.target.value)}
        />
      </label>
      <SignatureFileLinks files={sourceFiles} onRemove={onRemove} removeDisabled={disabled} />
      <div className="flex flex-wrap justify-end gap-2">
        {onCancel ? <Button type="button" variant="ghost" disabled={disabled} onClick={onCancel}>Cancel package</Button> : null}
        <Button type="button" variant="outline" disabled={disabled} onClick={onSave}>
          {disabled ? "Saving..." : active ? "Save draft" : "Create draft"}
        </Button>
        {onSend ? (
          <Button type="button" disabled={disabled || !sourceFiles.length} onClick={onSend}>
            <Send /> Send to requester
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function PendingPackage({
  disabled,
  onCancel,
  onRetry,
  request,
}: {
  disabled: boolean;
  onCancel: () => void;
  onRetry: () => void;
  request: FilingSignatureRequest;
}) {
  const files = signatureFilesByDirection(request, "pm_to_requester");
  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-muted/20 p-4 text-sm">
        <p className="font-medium">Waiting for the requester to return signed files.</p>
        <p className="mt-1 text-muted-foreground">Sent {formatDate(request.sent_at)}{request.due_at ? ` · Due ${formatDate(request.due_at)}` : ""}</p>
        {request.pm_note ? <p className="mt-3 whitespace-pre-wrap">{request.pm_note}</p> : null}
      </div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">Documents sent</p>
        {files.length > 1 ? <SignatureZipLink direction="pm_to_requester" signatureRequestId={request.id} /> : null}
      </div>
      <SignatureFileLinks files={files} />
      {request.email_status === "failed" ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <span className="flex items-center gap-2"><MailWarning /> Email failed: {request.email_last_error}</span>
          <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={onRetry}>Retry email</Button>
        </div>
      ) : request.email_status === "sent" ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">Email status: Sent</p>
          <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={onRetry}>Resend email</Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Email status: {statusLabel(request.email_status)}</p>
      )}
      <div className="flex justify-end">
        <Button type="button" variant="ghost" disabled={disabled} onClick={onCancel}>Cancel package</Button>
      </div>
    </div>
  );
}

function newestFirst(left: FilingSignatureRequest, right: FilingSignatureRequest) {
  return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function statusLabel(value: string) {
  return value.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function actionWarning(data: unknown) {
  if (!data || typeof data !== "object" || !("warning" in data)) {
    return null;
  }
  return typeof data.warning === "string" ? data.warning : null;
}
