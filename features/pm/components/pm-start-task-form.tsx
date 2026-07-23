"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { startTranslationTaskFromPm } from "@/features/pm/actions";

export function PmStartTaskForm({
  requestId,
}: {
  requestId: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("requestId", requestId);

      const result = await startTranslationTaskFromPm(formData);
      if (!result.success) {
        setError(result.error ?? "Failed to start the task.");
        return;
      }

      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        type="button"
        disabled={isPending}
        onClick={handleSubmit}
      >
        {isPending ? "Starting..." : "Start task"}
      </Button>
      {error ? <p className="max-w-72 text-right text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
