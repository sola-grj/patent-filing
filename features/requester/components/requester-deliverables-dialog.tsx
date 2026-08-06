"use client";

import { PackageOpen } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { DeliverableDownloadButton } from "@/features/requester/components/deliverable-download-button";
import { formatDate } from "@/features/requester/format";
import { jurisdictionOptions } from "@/features/requester/options";

export type RequesterDeliverable = {
  id: string;
  version_no?: number | null;
  storage_path?: string | null;
  created_at?: string | null;
  language?: string | null;
  jurisdiction_code?: string | null;
};

export function RequesterDeliverablesDialog({
  deliverables,
  orderId,
  requestId,
}: {
  deliverables: RequesterDeliverable[];
  orderId: string;
  requestId: string;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>
          <PackageOpen />
          View Deliverables
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader className="pr-8">
          <DialogTitle>Deliverables</DialogTitle>
          <DialogDescription>
            Download files individually by jurisdiction or get the complete
            delivery package.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium">Complete delivery package</p>
            <p className="mt-1 text-xs text-muted-foreground">
              All {deliverables.length} jurisdiction {deliverables.length === 1 ? "file" : "files"} in one ZIP.
            </p>
          </div>
          <DeliverableDownloadButton
            href={`/requester/requests/${requestId}/deliverables/download`}
            label="Download all"
          />
        </div>

        <div className="space-y-3">
          {deliverables.map((deliverable) => (
            <div
              key={deliverable.id}
              className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="font-medium">
                  {jurisdictionLabel(deliverable.jurisdiction_code)}
                </p>
                <p className="mt-1 truncate text-sm text-muted-foreground">
                  {storageName(deliverable.storage_path) || "Delivery file"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Version {deliverable.version_no ?? 1}
                  {deliverable.language
                    ? ` · ${deliverable.language.toUpperCase()}`
                    : ""}
                  {` · Uploaded ${formatDate(deliverable.created_at)}`}
                </p>
              </div>
              <DeliverableDownloadButton
                href={`/requester/orders/${orderId}/deliverables/${deliverable.id}`}
                iconOnly
                label={`Download ${jurisdictionLabel(deliverable.jurisdiction_code)} file`}
              />
            </div>
          ))}
        </div>

      </DialogContent>
    </Dialog>
  );
}

function jurisdictionLabel(code?: string | null) {
  if (!code) {
    return "General";
  }

  return jurisdictionOptions.find((option) => option.value === code)?.label ?? code;
}

function storageName(path?: string | null) {
  const parts = path?.split("/") ?? [];
  return parts[parts.length - 1] ?? "";
}
