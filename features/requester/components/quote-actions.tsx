"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  acceptQuote,
} from "@/features/requester/actions";

type QuoteActionType = "accept" | null;

export function QuoteActions({
  acceptLabel = "Confirm quotation",
  canAccept = true,
  requestId,
  quoteId,
}: {
  acceptLabel?: string;
  canAccept?: boolean;
  requestId: string;
  quoteId: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<QuoteActionType>(null);
  const [isPending, startTransition] = useTransition();

  function run(
    actionType: QuoteActionType,
    action: (formData: FormData) => Promise<{ success: boolean; error?: string }>,
    formData: FormData,
  ) {
    setError(null);
    setActiveAction(actionType);
    startTransition(async () => {
      const result = await action(formData);
      setError(result.error ?? null);
      if (!result.success) {
        setActiveAction(null);
      }
      if (result.success) window.location.reload();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {canAccept ? (
          <Button
            disabled={isPending}
            onClick={() => {
              const formData = baseFormData(requestId, quoteId);
              run("accept", acceptQuote, formData);
            }}
          >
            {isPending && activeAction === "accept" ? "Accepting..." : acceptLabel}
          </Button>
        ) : null}
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

function baseFormData(requestId: string, quoteId: string) {
  const formData = new FormData();
  formData.set("requestId", requestId);
  formData.set("quoteId", quoteId);
  return formData;
}
