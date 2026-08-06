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
      jurisdiction_code?: string | null;
    }> | null;
  }> | null;
};

export function PmDeliveryDialog({
  jurisdictionCodes,
  order,
  requestId,
}: {
  jurisdictionCodes: string[];
  order?: DeliveryOrder | null;
  requestId: string;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button">Deliver</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Delivery</DialogTitle>
          <DialogDescription>
            Upload one ZIP, PDF, DOC, or DOCX file for each jurisdiction, then
            deliver all files together.
          </DialogDescription>
        </DialogHeader>
        <PmDeliveryPanel
          embedded
          jurisdictionCodes={jurisdictionCodes}
          requestId={requestId}
          order={order}
        />
      </DialogContent>
    </Dialog>
  );
}
