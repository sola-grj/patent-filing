"use client";

import { MailWarning, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FileUploadDropzone } from "@/components/ui/file-upload-dropzone";
import type { FilingSignatureRequest } from "@/features/filing-signatures/types";
import { signatureFilesByDirection } from "@/features/filing-signatures/types";
import { FileList } from "@/features/requester/components/new-request-wizard-shared";

import { SignatureFileLinks, SignatureZipLink } from "./signature-file-links";

export function PmPendingSignaturePackage({
  canAppend,
  disabled,
  files: selectedFiles,
  inputKey,
  message,
  onAppend,
  onCancel,
  onFileChange,
  onOpenChange,
  onRetry,
  open,
  request,
}: {
  canAppend: boolean;
  disabled: boolean;
  files: File[];
  inputKey: number;
  message: string | null;
  onAppend: () => void;
  onCancel: () => void;
  onFileChange: (files: File[]) => void;
  onOpenChange: (open: boolean) => void;
  onRetry: () => void;
  open: boolean;
  request: FilingSignatureRequest;
}) {
  const files = signatureFilesByDirection(request, "pm_to_requester");

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-muted/20 p-4 text-sm">
        <p className="font-medium">Waiting for the requester to return signed files.</p>
        <p className="mt-1 text-muted-foreground">
          Sent {formatDate(request.sent_at)}
          {request.due_at ? ` · Due ${formatDate(request.due_at)}` : ""}
        </p>
        {request.pm_note ? <p className="mt-3 whitespace-pre-wrap">{request.pm_note}</p> : null}
      </div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">Documents sent</p>
        {files.length > 1 ? (
          <SignatureZipLink
            direction="pm_to_requester"
            signatureRequestId={request.id}
          />
        ) : null}
      </div>
      <SignatureFileLinks files={files} />
      {canAppend ? (
        <div className="flex min-h-16 flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed px-4 py-3">
          <div>
            <p className="text-sm font-medium">Send additional documents</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Add files to this package before the requester responds.
            </p>
          </div>
          <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogTrigger asChild>
              <Button type="button" variant="outline" disabled={disabled}>
                Add documents
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>Send additional documents</DialogTitle>
                <DialogDescription>
                  These files will be added to the current pending package. The requester will return all signed files together.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <FileUploadDropzone
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.zip"
                  disabled={disabled}
                  inputKey={inputKey}
                  label="Add signature documents"
                  onFilesChange={onFileChange}
                />
                <p className="text-xs text-muted-foreground">
                  PDF, DOC, DOCX, JPG, PNG, or ZIP · up to 10 files · 100 MB total for the package
                </p>
                <FileList
                  files={selectedFiles}
                  onRemove={(index) =>
                    onFileChange(selectedFiles.filter((_, fileIndex) => fileIndex !== index))
                  }
                />
                {message ? <p className="text-sm text-destructive">{message}</p> : null}
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline" disabled={disabled}>
                    Cancel
                  </Button>
                </DialogClose>
                <Button
                  type="button"
                  disabled={disabled || !selectedFiles.length}
                  onClick={onAppend}
                >
                  <Send /> {disabled ? "Sending..." : "Send documents"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      ) : null}
      {request.email_status === "failed" ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <span className="flex items-center gap-2">
            <MailWarning /> Email failed: {request.email_last_error}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={onRetry}
          >
            Retry email
          </Button>
        </div>
      ) : request.email_status === "sent" ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">Email status: Sent</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={onRetry}
          >
            Resend email
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Email status: {statusLabel(request.email_status)}
        </p>
      )}
      <div className="flex justify-end">
        <Button type="button" variant="ghost" disabled={disabled} onClick={onCancel}>
          Cancel package
        </Button>
      </div>
    </div>
  );
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function statusLabel(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
