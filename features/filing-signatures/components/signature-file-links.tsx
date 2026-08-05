"use client";

import { Download, FileText, X } from "lucide-react";

import { Button } from "@/components/ui/button";

import type { FilingSignatureFile } from "../types";

export function SignatureFileLinks({
  files,
  onRemove,
  removeDisabled = false,
}: {
  files: FilingSignatureFile[];
  onRemove?: (fileId: string) => void;
  removeDisabled?: boolean;
}) {
  if (!files.length) {
    return (
      <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
        No files uploaded yet.
      </p>
    );
  }

  return (
    <div className="divide-y rounded-lg border">
      {files.map((file) => (
        <div key={file.id} className="flex items-center gap-3 p-3">
          <span className="rounded-md bg-muted p-2 text-muted-foreground">
            <FileText className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">
              {file.original_filename}
            </span>
            <span className="block text-xs text-muted-foreground">
              {formatFileSize(Number(file.file_size))}
            </span>
          </span>
          <Button asChild size="sm" variant="ghost">
            <a href={`/api/filing-signatures/files/${file.id}`}>
              <Download />
              Download
            </a>
          </Button>
          {onRemove ? (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={`Remove ${file.original_filename}`}
              disabled={removeDisabled}
              onClick={() => onRemove(file.id)}
            >
              <X />
            </Button>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function SignatureZipLink({
  direction,
  signatureRequestId,
}: {
  direction: "pm_to_requester" | "requester_to_pm";
  signatureRequestId: string;
}) {
  return (
    <Button asChild size="sm" variant="outline">
      <a
        href={`/api/filing-signatures/requests/${signatureRequestId}/download?direction=${direction}`}
      >
        <Download />
        Download all
      </a>
    </Button>
  );
}

function formatFileSize(size: number) {
  if (size < 1024 * 1024) {
    return `${Math.max(1, Math.round(size / 102.4) / 10)} KB`;
  }
  return `${Math.round((size / (1024 * 1024)) * 10) / 10} MB`;
}
