import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { titleCaseStatus } from "@/features/requester/format";

import { PmStartTaskForm } from "./pm-start-task-form";

type TranslationTask = {
  id: string;
  request_file_id?: string | null;
  assigned_translator_id?: string | null;
  status?: string | null;
  task_type?: string | null;
  started_at?: string | null;
};

type Order = {
  id: string;
  order_no?: string | null;
  status?: string | null;
  offline_confirmation_status?: string | null;
  confirmed_at?: string | null;
  started_at?: string | null;
  translation_tasks?: TranslationTask[] | null;
};

type TranslatorOption = {
  userId: string;
  label: string;
  email: string | null;
  isSelectable: boolean;
};

export function PmTaskPanel({
  requestId,
  order,
  files,
  translators,
  canStartTask,
  quoteStatus,
}: {
  requestId: string;
  order?: Order | null;
  files: Array<{ id: string; original_filename: string }>;
  translators: TranslatorOption[];
  canStartTask: boolean;
  quoteStatus?: string | null;
}) {
  const tasks = [...(order?.translation_tasks ?? [])];
  const hasStartedTasks = tasks.length > 0;
  const hasQuote = Boolean(quoteStatus);
  const selectableTranslators = translators.filter((translator) => translator.isSelectable);
  const currentTranslatorId =
    tasks.find((task) => task.assigned_translator_id)?.assigned_translator_id ?? null;
  const defaultTranslatorId = currentTranslatorId ?? selectableTranslators[0]?.userId ?? "";
  return (
    <Card className="flex shrink-0 flex-col overflow-hidden">
      <CardHeader className="sticky top-0 z-10 shrink-0 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85">
        <CardTitle>Task control</CardTitle>
      </CardHeader>
      <CardContent className="hide-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto">
        {order || hasQuote || canStartTask || tasks.length ? (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
                  Order
                </p>
                <div className="mt-2 text-sm leading-6">
                  {order?.order_no ?? order?.id ?? "Will be created on task start"}
                </div>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
                  Order status
                </p>
                <div className="mt-2 text-sm leading-6">
                  {titleCaseStatus(order?.status ?? "pending")}
                </div>
              </div>
            </div>

            {!hasStartedTasks && !hasQuote ? (
              <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                Generate a quote before assigning a linguist.
              </p>
            ) : !hasStartedTasks && !canStartTask ? (
              <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                Requester must accept the current quote before PM can assign a
                linguist and start production.
              </p>
            ) : !hasStartedTasks && files.length === 0 ? (
              <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                No confirmed request files are available yet. Confirm files before starting
                translation tasks.
              </p>
            ) : canStartTask && selectableTranslators.length ? (
              <PmStartTaskForm
                requestId={requestId}
                translators={selectableTranslators}
                defaultTranslatorId={defaultTranslatorId}
                filesCount={files.length}
                hasExistingTasks={tasks.length > 0}
              />
            ) : (
              <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                No linguist account is available yet. Add an organization member with the
                `translator` role before starting tasks.
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Generate a quote before assigning a linguist.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
