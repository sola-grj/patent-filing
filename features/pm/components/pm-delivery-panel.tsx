"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { PackageCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isPublishedDeliverable } from "@/features/deliverables/delivery-progress";
import { deliverPmOrder, uploadPmDeliverableFile } from "@/features/pm/actions";
import { jurisdictionOptions } from "@/features/requester/options";
import { titleCaseStatus } from "@/features/requester/format";
import { usesSingleEpDelivery } from "@/features/requester/request-paths";

import { PmCountryDeliveryCard } from "./pm-country-delivery-card";

type TaskDeliverable = {
  id: string;
  version_no?: number | null;
  status?: string | null;
  storage_path?: string | null;
  created_at?: string | null;
  language?: string | null;
  ep_country_id?: number | null;
  jurisdiction_code?: string | null;
};

type DeliveryDestination = {
  key: string;
  label: string;
  displayCode: string;
  epCountryId?: number;
  jurisdictionCode?: string;
};

type Order = {
  id: string;
  status?: string | null;
  translation_tasks?: Array<{
    id: string;
    task_type?: string | null;
    status?: string | null;
    task_deliverables?: TaskDeliverable[] | null;
  }> | null;
};

export function PmDeliveryPanel({
  embedded = false,
  epCountryIds,
  epCountries,
  epServiceType,
  jurisdictionCodes,
  requestId,
  order,
}: {
  embedded?: boolean;
  epCountryIds: number[];
  epCountries: Array<{ id: number; name: string; abbr: string }>;
  epServiceType?: string;
  jurisdictionCodes: string[];
  requestId: string;
  order?: Order | null;
}) {
  const router = useRouter();
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deliverError, setDeliverError] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<Record<string, File | null>>({});
  const [inputKeys, setInputKeys] = useState<Record<string, number>>({});
  const [uploadingJurisdiction, setUploadingJurisdiction] = useState<string | null>(null);
  const [isUploading, startUploadTransition] = useTransition();
  const [isDelivering, startDeliverTransition] = useTransition();
  const isSingleDelivery = usesSingleEpDelivery(epServiceType);
  const destinations = useMemo<DeliveryDestination[]>(() => {
    if (isSingleDelivery) {
      return [{ key: "general", label: "Delivery", displayCode: "" }];
    }
    const countryIds = [...new Set(epCountryIds)]
      .filter((id) => Number.isInteger(id) && id > 0);
    if (countryIds.length) {
      return countryIds.map((id) => {
        const country = epCountries.find((item) => item.id === id);
        return {
          key: `ep:${id}`,
          label: country?.name ?? `EP country ${id}`,
          displayCode: country?.abbr || `ID ${id}`,
          epCountryId: id,
        };
      });
    }
    return [...new Set(jurisdictionCodes.map((code) => code.trim().toUpperCase()))]
      .filter((code) => /^[A-Z]{2}$/.test(code))
      .map((code) => ({
        key: `legacy:${code}`,
        label: jurisdictionLabel(code),
        displayCode: code,
        jurisdictionCode: code,
      }));
  }, [epCountries, epCountryIds, isSingleDelivery, jurisdictionCodes]);
  const deliverables = useMemo(
    () => (order?.translation_tasks ?? [])
      .flatMap((task) => task.task_deliverables ?? [])
      .sort((left, right) =>
        new Date(right.created_at ?? 0).getTime()
        - new Date(left.created_at ?? 0).getTime()),
    [order?.translation_tasks],
  );
  const draftsByDestination = latestByDestination(
    deliverables.filter((item) => item.status === "draft"),
  );
  const deliveredByDestination = latestByDestination(
    deliverables.filter((item) => isPublishedDeliverable(item.status)),
  );
  const generalDeliverables = isSingleDelivery ? [] : deliverables.filter(
    (item) => !item.ep_country_id && !item.jurisdiction_code,
  );
  const draftDestinationKeys = destinations
    .filter((destination) => draftsByDestination.has(destination.key))
    .map((destination) => destination.key);
  const deliveredCount = destinations.filter((destination) =>
    deliveredByDestination.has(destination.key)).length;
  const missingDestinations = destinations.filter((destination) =>
    !draftsByDestination.has(destination.key)
    && !deliveredByDestination.has(destination.key));
  const selectedDestinationKeys = destinations
    .filter((destination) => selectedFiles[destination.key])
    .map((destination) => destination.key);
  const canUpload = Boolean(order?.id) && order?.status !== "completed";
  const canDeliver = draftDestinationKeys.length > 0 && !isUploading;
  const completesRequest = destinations.length > 0
    && destinations.every((destination) =>
      draftsByDestination.has(destination.key)
      || deliveredByDestination.has(destination.key));

  function handleUploads(destinationKeys: string[], activeKey: string) {
    if (!order?.id || !destinationKeys.length) {
      setUploadError("Choose at least one delivery file before uploading.");
      return;
    }

    setUploadError(null);
    setDeliverError(null);
    setUploadingJurisdiction(activeKey);
    startUploadTransition(async () => {
      const results = await Promise.all(destinationKeys.map(async (key) => {
        const destination = destinations.find((item) => item.key === key)!;
        const formData = new FormData();
        formData.set("requestId", requestId);
        formData.set("orderId", order.id);
        if (destination.epCountryId) {
          formData.set("epCountryId", String(destination.epCountryId));
        } else if (destination.jurisdictionCode) {
          formData.set("jurisdictionCode", destination.jurisdictionCode ?? "");
        }
        formData.set("deliverableFile", selectedFiles[key] as File);

        try {
          return { key, destination, result: await uploadPmDeliverableFile(formData) };
        } catch (error) {
          return {
            key,
            destination,
            result: {
              success: false,
              error: error instanceof Error ? error.message : "Upload failed.",
            },
          };
        }
      }));
      const successfulKeys = results
        .filter(({ result }) => result.success)
        .map(({ key }) => key);
      const failures = results.filter(({ result }) => !result.success);

      if (successfulKeys.length) {
        setSelectedFiles((current) => Object.fromEntries(
          Object.entries(current).map(([key, file]) => [
            key,
            successfulKeys.includes(key) ? null : file,
          ]),
        ));
        setInputKeys((current) => ({
          ...current,
          ...Object.fromEntries(successfulKeys.map((key) => [
            key,
            (current[key] ?? 0) + 1,
          ])),
        }));
        router.refresh();
      }
      if (failures.length) {
        setUploadError(failures.map(({ destination, result }) =>
          `${destination.label}: ${result.error ?? "Upload failed."}`,
        ).join(" "));
      }
      setUploadingJurisdiction(null);
    });
  }

  function handleUpload(destinationKey: string) {
    handleUploads([destinationKey], destinationKey);
  }

  function handleUploadAll() {
    handleUploads(selectedDestinationKeys, "all");
  }

  function handleDeliver() {
    if (!order?.id) return;
    setUploadError(null);
    setDeliverError(null);
    startDeliverTransition(async () => {
      const formData = new FormData();
      formData.set("requestId", requestId);
      formData.set("orderId", order.id);
      const result = await deliverPmOrder(formData);
      if (!result.success) {
        setDeliverError(result.error ?? "Failed to deliver files.");
        return;
      }
      router.refresh();
    });
  }

  const summary = order ? (
    <div className="flex items-end justify-between gap-4">
      <div>
        <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
          Order status
        </p>
        <div className="mt-1 text-sm">{titleCaseStatus(order.status)}</div>
      </div>
      <p className="text-right text-sm font-medium">
        {isSingleDelivery
          ? `${deliveredCount} of 1 delivery completed`
          : `${deliveredCount} of ${destinations.length} countries delivered`}
        {draftDestinationKeys.length ? (
          <span className="block text-xs font-normal text-muted-foreground">
            {draftDestinationKeys.length} ready to deliver
          </span>
        ) : null}
      </p>
    </div>
  ) : null;

  const body = !order ? (
    <EmptyMessage>Start the translation task before uploading deliverables.</EmptyMessage>
  ) : (
    <>
      {!destinations.length ? (
        <EmptyMessage>No delivery jurisdictions are configured for this request.</EmptyMessage>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {destinations.map((destination) => (
            <PmCountryDeliveryCard
              key={destination.key}
              code={destination.displayCode}
              deliverable={draftsByDestination.get(destination.key)
                ?? deliveredByDestination.get(destination.key)}
              disabled={!canUpload || isUploading || isDelivering}
              inputKey={inputKeys[destination.key] ?? 0}
              isUploading={uploadingJurisdiction === destination.key}
              label={destination.label}
              selectedFile={selectedFiles[destination.key] ?? null}
              status={draftsByDestination.has(destination.key)
                ? "ready"
                : deliveredByDestination.has(destination.key)
                ? "delivered"
                : "missing"}
              onFileChange={(file) => setSelectedFiles((current) => ({
                ...current,
                [destination.key]: file,
              }))}
              onUpload={() => handleUpload(destination.key)}
            />
          ))}
        </div>
      )}

      {generalDeliverables.length ? (
        <div className="space-y-2 rounded-xl border p-4 text-sm">
          <p className="font-medium">General</p>
          {generalDeliverables.map((deliverable) => (
            <p key={deliverable.id} className="truncate text-muted-foreground">
              {storageName(deliverable.storage_path) || "Legacy delivery file"}
            </p>
          ))}
        </div>
      ) : null}

      {uploadError ? <p className="text-sm text-destructive">{uploadError}</p> : null}
      {deliverError ? <p className="text-sm text-destructive">{deliverError}</p> : null}
      {missingDestinations.length ? (
        <p className="text-sm text-muted-foreground">
          Missing: {missingDestinations.map((destination) => destination.label).join(", ")}
        </p>
      ) : null}
    </>
  );

  const actions = !order ? null : canUpload ? (
    <div className="flex flex-wrap justify-end gap-3">
      <Button
        type="button"
        variant="outline"
        className="min-w-32"
        disabled={!selectedDestinationKeys.length || isUploading || isDelivering}
        onClick={handleUploadAll}
      >
        {isUploading && uploadingJurisdiction === "all"
          ? "Uploading..."
          : `Upload all${selectedDestinationKeys.length
            ? ` (${selectedDestinationKeys.length})`
            : ""}`}
      </Button>
      <Button
        type="button"
        className="min-w-28"
        disabled={!canDeliver || isDelivering}
        onClick={handleDeliver}
      >
        {isDelivering
          ? "Delivering..."
          : completesRequest
            ? "Deliver & complete Request"
            : `Deliver available (${draftDestinationKeys.length})`}
      </Button>
    </div>
  ) : (
    <EmptyMessage>This order has already been delivered to the requester.</EmptyMessage>
  );

  if (embedded) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {summary ? (
          <div className="shrink-0 border-b px-6 pb-4">
            {summary}
          </div>
        ) : null}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
          {body}
        </div>
        {actions ? (
          <div className="shrink-0 border-t bg-background px-6 py-4">
            {actions}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <Card className="flex flex-col overflow-visible">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PackageCheck className="size-5" />
          Delivery
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {summary}
        {body}
        {actions}
      </CardContent>
    </Card>
  );
}

function EmptyMessage({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
      {children}
    </p>
  );
}

function jurisdictionLabel(code: string) {
  return jurisdictionOptions.find((option) => option.value === code)?.label ?? code;
}

function storageName(path?: string | null) {
  const parts = path?.split("/") ?? [];
  return parts[parts.length - 1] ?? "";
}

function latestByDestination(deliverables: TaskDeliverable[]) {
  const result = new Map<string, TaskDeliverable>();

  for (const deliverable of deliverables) {
    const key = deliverable.ep_country_id
      ? `ep:${deliverable.ep_country_id}`
      : deliverable.jurisdiction_code
        ? `legacy:${deliverable.jurisdiction_code}`
        : "general";
    if (!result.has(key)) {
      result.set(key, deliverable);
    }
  }

  return result;
}
