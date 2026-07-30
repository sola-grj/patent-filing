"use client";

import { Download, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const DOWNLOAD_COOLDOWN_MS = 800;

export function PatentFileDownloadButton({
  requestId,
  status,
}: {
  requestId: string;
  status?: string | null;
}) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastClickAt = useRef(0);
  const cooldownTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (cooldownTimer.current) clearTimeout(cooldownTimer.current);
  }, []);

  async function handleDownload() {
    const now = Date.now();
    if (isDownloading || now - lastClickAt.current < DOWNLOAD_COOLDOWN_MS) return;

    lastClickAt.current = now;
    setIsDownloading(true);
    setError(null);

    try {
      const response = await fetch(`/api/requests/${requestId}/patent-file`);
      if (response.redirected) {
        throw new Error("The download request was redirected. Please sign in again.");
      }
      if (!response.ok) {
        const body = await response.json().catch(() => null) as {
          error?: string;
        } | null;
        throw new Error(
          body?.error
          || `Unable to download the original patent file (${response.status}).`,
        );
      }

      const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
      if (
        !contentType.includes("application/pdf")
        && !contentType.includes("application/octet-stream")
      ) {
        throw new Error("The download service returned an invalid file response.");
      }

      const disposition = response.headers.get("content-disposition");
      if (!disposition) {
        throw new Error("The download response did not include a file name.");
      }
      const fileName = fileNameFromDisposition(disposition);
      if (!fileName) {
        throw new Error("The download response included an invalid file name.");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "Download failed.");
    } finally {
      cooldownTimer.current = setTimeout(() => setIsDownloading(false), DOWNLOAD_COOLDOWN_MS);
    }
  }

  const isReady = status === "parsed";
  const tooltip = error
    ?? (status === "validated" || status === "parsing"
      ? "Original patent file is being prepared..."
      : status === "failed"
        ? "Original patent file preparation failed. Retry it first."
        : isDownloading
          ? "Downloading original file..."
          : isReady
            ? "Download original file"
            : "Original patent file is unavailable.");

  return (
    <div className="flex flex-col items-end gap-1">
      <TooltipProvider delayDuration={120}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label="Download original file"
              disabled={isDownloading || !isReady}
              onClick={handleDownload}
            >
              {isDownloading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Download className="size-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{tooltip}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {error ? (
        <p role="alert" className="max-w-72 text-right text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function fileNameFromDisposition(disposition: string) {
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) return decodeURIComponent(encoded);
  return disposition.match(/filename="?([^";]+)"?/i)?.[1] ?? null;
}
