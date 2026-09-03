"use client";

import { useState } from "react";
import { Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function QuoteDownloadMenu({ quoteId }: { quoteId?: string }) {
  const [pendingFormat, setPendingFormat] = useState<"pdf" | "xlsx" | null>(null);

  async function download(format: "pdf" | "xlsx") {
    if (!quoteId || pendingFormat) return;
    setPendingFormat(format);
    try {
      const response = await fetch(`/api/quotes/${quoteId}/export?format=${format}`);
      if (!response.ok) {
        const result = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(result?.error ?? "Unable to download the quotation.");
      }
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = responseFileName(response.headers.get("content-disposition")) ?? `Pat-quotation.${format}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Unable to download the quotation.");
    } finally {
      setPendingFormat(null);
    }
  }

  if (!quoteId) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" size="sm" variant="outline" disabled={pendingFormat !== null}>
          {pendingFormat ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
          Download
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => { void download("pdf"); }}>
          <FileText /> PDF
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => { void download("xlsx"); }}>
          <FileSpreadsheet /> Excel
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function responseFileName(contentDisposition: string | null) {
  if (!contentDisposition) return null;
  const encoded = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) return decodeURIComponent(encoded);
  return contentDisposition.match(/filename="([^"]+)"/i)?.[1] ?? null;
}
