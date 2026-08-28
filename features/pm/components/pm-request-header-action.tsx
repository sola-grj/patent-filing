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
      ep_country_id?: number | null;
      jurisdiction_code?: string | null;
    }> | null;
  }> | null;
};

export function PmRequestHeaderAction({
  epCountryIds,
  epCountries,
  epServiceType,
  jurisdictionCodes,
  order,
  requestId,
  status,
}: {
  epCountryIds: number[];
  epCountries: Array<{ id: number; name: string; abbr: string }>;
  epServiceType?: string;
  jurisdictionCodes: string[];
  order?: HeaderOrder | null;
  requestId: string;
  status?: string | null;
}) {
  if (status === "responding") {
    return <PmStartTaskForm requestId={requestId} />;
  }

  if (status === "in_progress") {
    return (
      <PmDeliveryDialog
        epCountryIds={epCountryIds}
        epCountries={epCountries}
        epServiceType={epServiceType}
        jurisdictionCodes={jurisdictionCodes}
        requestId={requestId}
        order={order}
      />
    );
  }

  return null;
}
