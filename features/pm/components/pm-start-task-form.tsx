"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { startTranslationTaskFromPm } from "@/features/pm/actions";

type TranslatorOption = {
  userId: string;
  label: string;
  email: string | null;
};

export function PmStartTaskForm({
  requestId,
  translators,
  defaultTranslatorId,
  filesCount,
  hasExistingTasks,
}: {
  requestId: string;
  translators: TranslatorOption[];
  defaultTranslatorId: string;
  filesCount: number;
  hasExistingTasks: boolean;
}) {
  const router = useRouter();
  const [translatorId, setTranslatorId] = useState(defaultTranslatorId);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("requestId", requestId);
      formData.set("translatorId", translatorId);

      const result = await startTranslationTaskFromPm(formData);
      if (!result.success) {
        setError(result.error ?? "Failed to start the task.");
        return;
      }

      router.refresh();
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-lg border bg-muted/10 p-4">
      <label className="block space-y-2 text-sm">
        <span className="font-medium">Linguist</span>
        <select
          name="translatorId"
          value={translatorId}
          onChange={(event) => setTranslatorId(event.target.value)}
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          disabled={isPending}
        >
          {translators.map((translator) => (
            <option key={translator.userId} value={translator.userId}>
              {translator.label}
            </option>
          ))}
        </select>
      </label>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">
        Start translation tasks for {filesCount} confirmed file
        {filesCount === 1 ? "" : "s"} and move this request into production.
      </p>
      <Button
        type="button"
        className="mt-auto w-full"
        disabled={isPending}
        onClick={handleSubmit}
      >
        {isPending
          ? "Starting..."
          : hasExistingTasks
            ? "Reassign and restart task"
            : "Start task"}
      </Button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
