"use client";

import { Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

const DOWNLOAD_COOLDOWN_MS = 800;

export function PatentFileDownloadButton({ requestId }: { requestId: string }) {
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
      const response = await fetch(`/requester/requests/${requestId}/patent-file`);
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error || "Unable to download the original patent file.");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileNameFromDisposition(response.headers.get("content-disposition"));
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "Download failed.");
    } finally {
      cooldownTimer.current = setTimeout(() => setIsDownloading(false), DOWNLOAD_COOLDOWN_MS);
    }
  }

  return (
    <div className="space-y-2">
      <Button type="button" variant="outline" size="sm" disabled={isDownloading} onClick={handleDownload}>
        <Download className="size-4" />
        {isDownloading ? "Downloading..." : "Download original file"}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function fileNameFromDisposition(disposition: string | null) {
  const encoded = disposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) return decodeURIComponent(encoded);
  return disposition?.match(/filename="?([^";]+)"?/i)?.[1] || "original-patent.pdf";
}
