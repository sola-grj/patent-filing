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

export function PmTaskPanel({
  requestId,
  order,
  files,
  requestStatus,
}: {
  requestId: string;
  order?: Order | null;
  files: Array<{ id: string; original_filename: string }>;
  requestStatus?: string | null;
}) {
  const tasks = [...(order?.translation_tasks ?? [])];
  const hasStartedTasks = tasks.length > 0;
  const hasCompletedTasks =
    (order?.status ?? null) === "completed" ||
    tasks.some((task) => task.status === "completed");
  const canStartTask = requestStatus === "responding";
  return (
    <Card className="flex shrink-0 flex-col overflow-hidden">
      <CardHeader className="sticky top-0 z-10 shrink-0 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85">
        <CardTitle>Task control</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
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

        {hasCompletedTasks ? (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            This task has already been completed.
          </p>
        ) : canStartTask && files.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            No confirmed request files are available yet. Confirm files before starting
            translation tasks.
          </p>
        ) : canStartTask ? (
          <PmStartTaskForm
            requestId={requestId}
          />
        ) : hasStartedTasks ? (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            Production has started for this request.
          </p>
        ) : (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            Tasks can be started while the request is Responding.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
