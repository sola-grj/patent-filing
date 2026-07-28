"use client";

import { AlertCircle, Loader2, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { retrySubmittedPatentCache } from "@/features/requester/actions";

export function PatentCacheStatus({
  requestId,
  status,
}: {
  requestId: string;
  status?: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (status !== "parsing") return;
    const timer = window.setInterval(() => router.refresh(), 2500);
    return () => window.clearInterval(timer);
  }, [router, status]);

  if (!["parsing", "failed"].includes(status ?? "") && !isPending && !error) {
    return null;
  }
  if (status === "parsing" || isPending) {
    return (
      <div className="flex items-center gap-3 rounded-xl border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <p>Original patent file is being prepared...</p>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
      <AlertCircle className="h-4 w-4" />
      <p className="min-w-0 flex-1">
        {error ?? "Original patent file preparation failed. You can retry it."}
      </p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await retrySubmittedPatentCache(requestId);
            setError(result.error ?? null);
          });
        }}
      >
        <RotateCcw className="mr-2 h-4 w-4" />
        Retry
      </Button>
    </div>
  );
}
