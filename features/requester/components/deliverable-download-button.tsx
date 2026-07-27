"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export function DeliverableDownloadButton({ href }: { href: string }) {
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
        throw new Error(body?.error || "Unable to download the ZIP file.");
      }

      const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
      if (
        !contentType.includes("application/zip")
        && !contentType.includes("application/octet-stream")
      ) {
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
        variant="secondary"
        size="sm"
        disabled={isDownloading}
        onClick={handleDownload}
      >
        {isDownloading ? <Loader2 className="animate-spin" /> : null}
        {isDownloading ? "Downloading..." : "Download ZIP"}
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
