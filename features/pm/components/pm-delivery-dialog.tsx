"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import { PmDeliveryPanel } from "./pm-delivery-panel";

type DeliveryOrder = {
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

export function PmDeliveryDialog({
  epCountryIds,
  epCountries,
  epServiceType,
  jurisdictionCodes,
  order,
  requestId,
}: {
  epCountryIds: number[];
  epCountries: Array<{ id: number; name: string; abbr: string }>;
  epServiceType?: string;
  jurisdictionCodes: string[];
  order?: DeliveryOrder | null;
  requestId: string;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button">Deliver</Button>
      </DialogTrigger>
      <DialogContent className="flex h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="shrink-0 px-6 pb-4 pt-6 pr-12">
          <DialogTitle>Delivery</DialogTitle>
          <DialogDescription>
            {epServiceType === "ep_granting" || epServiceType === "unitary_patent"
              ? "Upload one ZIP, PDF, DOC, or DOCX file to deliver this Request."
              : "Upload one ZIP, PDF, DOC, or DOCX file per jurisdiction. You can deliver available countries now; the Request completes after every configured jurisdiction has been delivered."}
          </DialogDescription>
        </DialogHeader>
        <PmDeliveryPanel
          embedded
          epCountryIds={epCountryIds}
          epCountries={epCountries}
          epServiceType={epServiceType}
          jurisdictionCodes={jurisdictionCodes}
          requestId={requestId}
          order={order}
        />
      </DialogContent>
    </Dialog>
  );
}
