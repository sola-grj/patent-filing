"use client";

import { Download, Loader2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

const allowedDeliverableContentTypes = [
  "application/zip",
  "application/x-zip-compressed",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/octet-stream",
];

export function DeliverableDownloadButton({
  href,
  iconOnly = false,
  label = "Download file",
}: {
  href: string;
  iconOnly?: boolean;
  label?: string;
}) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload() {
    if (isDownloading) {
      return;
    }

    setIsDownloading(true);
    setError(null);

    try {
      const response = await fetch(href);
      if (response.redirected) {
        throw new Error("The download request was redirected. Please sign in again.");
      }
      if (!response.ok) {
        const body = await response.json().catch(() => null) as {
          error?: string;
        } | null;
        throw new Error(body?.error || "Unable to download the delivery file.");
      }

      const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
      if (!allowedDeliverableContentTypes.some((type) => contentType.includes(type))) {
        throw new Error("The download service returned an invalid file response.");
      }

      const disposition = response.headers.get("content-disposition");
      const fileName = disposition ? fileNameFromDisposition(disposition) : null;
      if (!fileName) {
        throw new Error("The download response did not include a valid file name.");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : "Download failed.",
      );
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        type="button"
        className={iconOnly ? "size-9 p-0 shadow-none" : "h-9 px-5 shadow-md"}
        disabled={isDownloading}
        aria-label={iconOnly ? label : undefined}
        title={iconOnly ? label : undefined}
        onClick={handleDownload}
      >
        {isDownloading ? (
          <Loader2 className="animate-spin" />
        ) : (
          <Download />
        )}
        {iconOnly ? (
          <span className="sr-only">
            {isDownloading ? "Downloading..." : label}
          </span>
        ) : isDownloading ? (
          "Downloading..."
        ) : (
          label
        )}
      </Button>
      {error ? (
        <p role="alert" className="max-w-64 text-right text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function fileNameFromDisposition(disposition: string) {
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) {
    return decodeURIComponent(encoded);
  }

  return disposition.match(/filename="?([^";]+)"?/i)?.[1] ?? null;
}
