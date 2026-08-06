"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { PackageCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { deliverPmOrder, uploadPmDeliverableFile } from "@/features/pm/actions";
import { jurisdictionOptions } from "@/features/requester/options";
import { titleCaseStatus } from "@/features/requester/format";

import { PmCountryDeliveryCard } from "./pm-country-delivery-card";

type TaskDeliverable = {
  id: string;
  version_no?: number | null;
  status?: string | null;
  storage_path?: string | null;
  created_at?: string | null;
  language?: string | null;
  jurisdiction_code?: string | null;
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
  jurisdictionCodes,
  requestId,
  order,
}: {
  embedded?: boolean;
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
  const countryCodes = useMemo(
    () => [...new Set(jurisdictionCodes.map((code) => code.trim().toUpperCase()))]
      .filter((code) => /^[A-Z]{2}$/.test(code)),
    [jurisdictionCodes],
  );
  const deliverables = useMemo(
    () => (order?.translation_tasks ?? [])
      .flatMap((task) => task.task_deliverables ?? [])
      .sort((left, right) =>
        new Date(right.created_at ?? 0).getTime()
        - new Date(left.created_at ?? 0).getTime()),
    [order?.translation_tasks],
  );
  const readyByCountry = new Map(
    deliverables
      .filter((item) => ["draft", "submitted"].includes(item.status ?? "")
        && item.jurisdiction_code)
      .map((item) => [item.jurisdiction_code as string, item]),
  );
  const legacyDeliverables = deliverables.filter((item) => !item.jurisdiction_code);
  const readyCount = countryCodes.filter((code) => readyByCountry.has(code)).length;
  const missingCountries = countryCodes.filter((code) => !readyByCountry.has(code));
  const selectedCountryCodes = countryCodes.filter((code) => selectedFiles[code]);
  const canUpload = Boolean(order?.id) && order?.status !== "completed";
  const canDeliver = countryCodes.length > 0
    && missingCountries.length === 0
    && !isUploading;

  function handleUploads(jurisdictionCodesToUpload: string[], activeKey: string) {
    if (!order?.id || !jurisdictionCodesToUpload.length) {
      setUploadError("Choose at least one delivery file before uploading.");
      return;
    }

    setUploadError(null);
    setDeliverError(null);
    setUploadingJurisdiction(activeKey);
    startUploadTransition(async () => {
      const results = await Promise.all(jurisdictionCodesToUpload.map(async (code) => {
        const formData = new FormData();
        formData.set("requestId", requestId);
        formData.set("orderId", order.id);
        formData.set("jurisdictionCode", code);
        formData.set("deliverableFile", selectedFiles[code] as File);

        try {
          return { code, result: await uploadPmDeliverableFile(formData) };
        } catch (error) {
          return {
            code,
            result: {
              success: false,
              error: error instanceof Error ? error.message : "Upload failed.",
            },
          };
        }
      }));
      const successfulCodes = results
        .filter(({ result }) => result.success)
        .map(({ code }) => code);
      const failures = results.filter(({ result }) => !result.success);

      if (successfulCodes.length) {
        setSelectedFiles((current) => Object.fromEntries(
          Object.entries(current).map(([code, file]) => [
            code,
            successfulCodes.includes(code) ? null : file,
          ]),
        ));
        setInputKeys((current) => ({
          ...current,
          ...Object.fromEntries(successfulCodes.map((code) => [
            code,
            (current[code] ?? 0) + 1,
          ])),
        }));
        router.refresh();
      }
      if (failures.length) {
        setUploadError(failures.map(({ code, result }) =>
          `${jurisdictionLabel(code)}: ${result.error ?? "Upload failed."}`,
        ).join(" "));
      }
      setUploadingJurisdiction(null);
    });
  }

  function handleUpload(jurisdictionCode: string) {
    handleUploads([jurisdictionCode], jurisdictionCode);
  }

  function handleUploadAll() {
    handleUploads(selectedCountryCodes, "all");
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

  const content = !order ? (
    <EmptyMessage>Start the translation task before uploading deliverables.</EmptyMessage>
  ) : (
    <>
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
            Order status
          </p>
          <div className="mt-1 text-sm">{titleCaseStatus(order.status)}</div>
        </div>
        <p className="text-sm font-medium">{readyCount} of {countryCodes.length} countries ready</p>
      </div>

      {!countryCodes.length ? (
        <EmptyMessage>No delivery jurisdictions are configured for this request.</EmptyMessage>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {countryCodes.map((code) => (
            <PmCountryDeliveryCard
              key={code}
              code={code}
              deliverable={readyByCountry.get(code)}
              disabled={!canUpload || isUploading || isDelivering}
              inputKey={inputKeys[code] ?? 0}
              isUploading={uploadingJurisdiction === code}
              label={jurisdictionLabel(code)}
              selectedFile={selectedFiles[code] ?? null}
              onFileChange={(file) => setSelectedFiles((current) => ({
                ...current,
                [code]: file,
              }))}
              onUpload={() => handleUpload(code)}
            />
          ))}
        </div>
      )}

      {legacyDeliverables.length ? (
        <div className="space-y-2 rounded-xl border p-4 text-sm">
          <p className="font-medium">General</p>
          {legacyDeliverables.map((deliverable) => (
            <p key={deliverable.id} className="truncate text-muted-foreground">
              {storageName(deliverable.storage_path) || "Legacy delivery file"}
            </p>
          ))}
        </div>
      ) : null}

      {uploadError ? <p className="text-sm text-destructive">{uploadError}</p> : null}
      {deliverError ? <p className="text-sm text-destructive">{deliverError}</p> : null}
      {missingCountries.length ? (
        <p className="text-sm text-muted-foreground">
          Missing: {missingCountries.map(jurisdictionLabel).join(", ")}
        </p>
      ) : null}
      {canUpload ? (
        <div className="flex flex-wrap justify-end gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            className="min-w-32"
            disabled={!selectedCountryCodes.length || isUploading || isDelivering}
            onClick={handleUploadAll}
          >
            {isUploading && uploadingJurisdiction === "all"
              ? "Uploading..."
              : `Upload all${selectedCountryCodes.length
                ? ` (${selectedCountryCodes.length})`
                : ""}`}
          </Button>
          <Button
            type="button"
            className="min-w-28"
            disabled={!canDeliver || isDelivering}
            onClick={handleDeliver}
          >
            {isDelivering ? "Delivering..." : "Deliver"}
          </Button>
        </div>
      ) : (
        <EmptyMessage>This order has already been delivered to the requester.</EmptyMessage>
      )}
    </>
  );

  if (embedded) return <div className="space-y-4">{content}</div>;

  return (
    <Card className="flex flex-col overflow-visible">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PackageCheck className="size-5" />
          Delivery
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">{content}</CardContent>
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
