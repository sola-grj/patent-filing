"use client";

import { CheckCircle2, FileUp, Loader2, Trash2 } from "lucide-react";
import { useId, useRef } from "react";

import { Button } from "@/components/ui/button";
import type {
  WizardPatentAnalysisResult,
  WizardPatentAnalysisStatus,
  WizardUploadedFile,
} from "@/features/requester/wizard-types";
import { isVerifiedCustomerTifg } from "@/features/requester/epo-tifg-upload";

export function EpGrantingTifgUpload({
  files,
  snapshots,
  status,
  analysis,
  analysisError,
  validationError,
  onFilesChange,
  onRemove,
}: {
  files: File[];
  snapshots: WizardUploadedFile[];
  status: WizardPatentAnalysisStatus;
  analysis?: WizardPatentAnalysisResult;
  analysisError?: string;
  validationError?: string;
  onFilesChange: (files: File[]) => void;
  onRemove: () => void;
}) {
  const displayedFile = files[0] ?? snapshots[0];
  const verified = isVerifiedCustomerTifg(analysis);
  const fileInputId = useId();
  const fileNameId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function openFileChooser() {
    const input = fileInputRef.current;
    if (!input) return;
    input.value = "";
    input.click();
  }

  return (
    <section className="space-y-4 rounded-xl border border-amber-300 bg-amber-50/60 p-4 md:col-span-2">
      <div className="flex items-start gap-3">
        <FileUp className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
        <div>
          <h3 className="text-sm font-semibold text-amber-950">
            Upload Text intended for grant (clean copy)
          </h3>
          <p className="mt-1 text-xs leading-5 text-amber-900/80">
            No B1 publication is available for this EP Granting case. Download the
            clean-copy PDF manually from the European Patent Register, then upload
            it here. Pat will verify the EP identity before parsing it.
          </p>
        </div>
      </div>

      {displayedFile ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background px-3 py-3 text-sm">
          <div className="min-w-0">
            <p className="truncate font-medium">{displayedFile.name}</p>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              {status === "pending" ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Verifying document identity and parsing claims...
                </>
              ) : null}
              {verified ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  Verified customer TIFG upload
                </>
              ) : null}
              {status === "idle" ? "Reattach this PDF to verify it again." : null}
              {status === "error" ? "Verification or parsing failed." : null}
              {status === "complete" && !verified ? (
                "Parsing did not complete successfully. Replace the PDF or retry."
              ) : null}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={status === "pending"}
            onClick={onRemove}
          >
            {status === "pending" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="mr-2 h-4 w-4" />
            )}
            Remove
          </Button>
        </div>
      ) : null}

      {!displayedFile || status !== "pending" ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-background px-3 py-2">
          <input
            ref={fileInputRef}
            id={fileInputId}
            type="file"
            accept=".pdf,application/pdf"
            className="sr-only"
            aria-describedby={fileNameId}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) onFilesChange([file]);
              event.currentTarget.value = "";
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-controls={fileInputId}
            onClick={openFileChooser}
          >
            <FileUp className="mr-2 h-4 w-4" />
            {displayedFile ? "Choose a different file" : "Choose file"}
          </Button>
          <span id={fileNameId} className="text-sm text-muted-foreground">
            {displayedFile?.name ?? "No file selected"}
          </span>
        </div>
      ) : null}

      {analysisError ? <p className="text-sm text-destructive">{analysisError}</p> : null}
      {!analysisError && validationError ? (
        <p className="text-sm text-destructive">{validationError}</p>
      ) : null}
    </section>
  );
}
