import { PmDeliveryDialog } from "./pm-delivery-dialog";
import { PmStartTaskForm } from "./pm-start-task-form";

type HeaderOrder = {
  id: string;
  status?: string | null;
  translation_tasks?: Array<{
    id: string;
    task_type?: string | null;
    status?: string | null;
    task_deliverables?: Array<{
      id: string;
      version_no?: number | null;
      status?: string | null;
      storage_path?: string | null;
      created_at?: string | null;
      language?: string | null;
    }> | null;
  }> | null;
};

export function PmRequestHeaderAction({
  order,
  requestId,
  status,
}: {
  order?: HeaderOrder | null;
  requestId: string;
  status?: string | null;
}) {
  if (status === "responding") {
    return <PmStartTaskForm requestId={requestId} />;
  }

  if (status === "in_progress") {
    return <PmDeliveryDialog requestId={requestId} order={order} />;
  }

  return null;
}
