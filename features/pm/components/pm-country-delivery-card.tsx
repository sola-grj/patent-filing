"use client";

import { Button } from "@/components/ui/button";
import { FileUploadField } from "@/components/ui/file-upload-field";
import { formatDate } from "@/features/requester/format";

type CountryDeliverable = {
  created_at?: string | null;
  storage_path?: string | null;
};

export function PmCountryDeliveryCard({
  code,
  deliverable,
  disabled,
  inputKey,
  isUploading,
  label,
  selectedFile,
  status,
  onFileChange,
  onUpload,
}: {
  code: string;
  deliverable?: CountryDeliverable | null;
  disabled: boolean;
  inputKey: number;
  isUploading: boolean;
  label: string;
  selectedFile: File | null;
  status: "delivered" | "missing" | "ready";
  onFileChange: (file: File | null) => void;
  onUpload: () => void;
}) {
  return (
    <div className="space-y-3 rounded-xl border p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">{label}</p>
          <p className="mt-1 text-xs text-muted-foreground">{code}</p>
        </div>
        <span className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground">
          {status === "delivered"
            ? "Delivered"
            : status === "ready"
              ? "Ready to deliver"
              : "Missing"}
        </span>
      </div>

      {deliverable ? (
        <div className="rounded-md bg-muted/30 px-3 py-2 text-sm">
          <p className="truncate font-medium">
            {storageName(deliverable.storage_path) || "Uploaded file"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Uploaded {formatDate(deliverable.created_at)}
          </p>
        </div>
      ) : null}

      <FileUploadField
        accept=".zip,.pdf,.doc,.docx,application/zip,application/x-zip-compressed,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        acceptedTypeLabel="ZIP, PDF, DOC, or DOCX"
        description={`Choose the delivery file for ${label}.`}
        disabled={disabled}
        inputKey={inputKey}
        label={`${label} delivery file`}
        selectedFile={selectedFile}
        onFileChange={onFileChange}
      />
      <Button
        type="button"
        variant="outline"
        className="w-full"
        disabled={disabled || !selectedFile}
        onClick={onUpload}
      >
        {isUploading
          ? "Uploading..."
          : status !== "missing"
            ? "Replace file"
            : "Upload file"}
      </Button>
    </div>
  );
}

function storageName(path?: string | null) {
  if (!path) {
    return "";
  }

  const parts = path.split("/");
  return parts[parts.length - 1] ?? "";
}
