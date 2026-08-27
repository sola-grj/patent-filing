"use client";

import { AlertCircle, Loader2, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import type {
  WizardPatentAnalysisResult,
  WizardPatentAnalysisStatus,
} from "@/features/requester/wizard-types";

export function PatentProcessingNotice({
  status,
  result,
  error,
  onRetry,
}: {
  status: WizardPatentAnalysisStatus;
  result?: WizardPatentAnalysisResult;
  error?: string;
  onRetry?: () => void;
}) {
  if (status === "complete" && result?.status === "success") {
    return null;
  }

  if (
    status === "error"
    || result?.status === "failed"
    || (result?.status === "partial" && result.aggregate.total_words <= 0)
  ) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
        <AlertCircle className="h-4 w-4 shrink-0" />
        <p className="min-w-0 flex-1">
          {error || "Patent data processing failed. Retry before submitting."}
        </p>
        {onRetry ? (
          <Button type="button" size="sm" variant="outline" onClick={onRetry}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Retry
          </Button>
        ) : null}
      </div>
    );
  }

  if (status === "complete" && result?.status === "partial") {
    return (
      <div className="flex gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Patent data processing completed with warnings. Review the available
          word counts before submitting.
        </p>
      </div>
    );
  }

  if (status === "idle") {
    return (
      <div className="flex items-center gap-3 rounded-xl border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        <AlertCircle className="h-4 w-4 shrink-0" />
        <p>Patent data has not been processed yet.</p>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
      <p>Patent data is being processed...</p>
    </div>
  );
}
