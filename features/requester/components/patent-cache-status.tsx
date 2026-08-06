"use client";

import { AlertCircle, Loader2, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { retrySubmittedPatentCache } from "@/features/requester/actions";

export function PatentCacheStatus({
  requestId,
  status,
  updatedAt,
}: {
  requestId: string;
  status?: string | null;
  updatedAt?: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [isPending, startTransition] = useTransition();
  const isPreparing = status === "validated" || status === "parsing";
  const updatedTime = updatedAt ? new Date(updatedAt).getTime() : Number.NaN;
  const isStale = isPreparing
    && Number.isFinite(updatedTime)
    && now - updatedTime >= 120_000;

  useEffect(() => {
    if (!isPreparing) return;
    const timer = window.setInterval(() => {
      setNow(Date.now());
      router.refresh();
    }, 2500);
    return () => window.clearInterval(timer);
  }, [isPreparing, router]);

  if (
    !["validated", "parsing", "failed"].includes(status ?? "")
    && !isPending
    && !error
  ) {
    return null;
  }
  if ((isPreparing && !isStale) || isPending) {
    return (
      <div className="flex items-center gap-3 rounded-xl border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <p>Patent document is being made available...</p>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
      <AlertCircle className="h-4 w-4" />
      <p className="min-w-0 flex-1">
        {error
          ?? (isStale
            ? "Making the patent document available is taking longer than expected. You can retry it."
            : "The patent document could not be made available. You can retry it.")}
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
            router.refresh();
          });
        }}
      >
        <RotateCcw className="mr-2 h-4 w-4" />
        Retry
      </Button>
    </div>
  );
}
