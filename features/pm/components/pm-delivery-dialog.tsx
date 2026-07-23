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
    }> | null;
  }> | null;
};

export function PmDeliveryDialog({
  order,
  requestId,
}: {
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
            Upload and deliver the translated ZIP package to the requester.
          </DialogDescription>
        </DialogHeader>
        <PmDeliveryPanel embedded requestId={requestId} order={order} />
      </DialogContent>
    </Dialog>
  );
}
