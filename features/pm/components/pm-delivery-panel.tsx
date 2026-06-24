"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileUploadField } from "@/components/ui/file-upload-field";
import { deliverPmOrder, uploadPmDeliverableZip } from "@/features/pm/actions";
import { StatusBadge, formatDate, titleCaseStatus } from "@/features/requester/format";

type TaskDeliverable = {
  id: string;
  version_no?: number | null;
  status?: string | null;
  storage_path?: string | null;
  created_at?: string | null;
  language?: string | null;
};

type TranslationTask = {
  id: string;
  task_type?: string | null;
  status?: string | null;
  task_deliverables?: TaskDeliverable[] | null;
};

type Order = {
  id: string;
  status?: string | null;
  translation_tasks?: TranslationTask[] | null;
};

export function PmDeliveryPanel({
  requestId,
  order,
}: {
  requestId: string;
  order?: Order | null;
}) {
  const router = useRouter();
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deliverError, setDeliverError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const [isUploading, startUploadTransition] = useTransition();
  const [isDelivering, startDeliverTransition] = useTransition();

  const deliverables = useMemo(() => {
    return (order?.translation_tasks ?? [])
      .flatMap((task) =>
        (task.task_deliverables ?? []).map((deliverable) => ({
          ...deliverable,
          taskId: task.id,
          taskType: task.task_type ?? "translation",
        })),
      )
      .sort((left, right) => {
        const rightTime = new Date(right.created_at ?? 0).getTime();
        const leftTime = new Date(left.created_at ?? 0).getTime();
        return rightTime - leftTime;
      });
  }, [order?.translation_tasks]);

  const draftDeliverables = deliverables.filter((deliverable) => deliverable.status === "draft");
  const canUpload = Boolean(order?.id) && (order?.status ?? null) !== "completed";
  const canDeliver = draftDeliverables.length > 0 && !isUploading;

  function handleUpload() {
    if (!order?.id) {
      setUploadError("Start the task before uploading deliverables.");
      return;
    }

    if (!selectedFile) {
      setUploadError("Please choose a ZIP file to upload.");
      return;
    }

    setUploadError(null);
    setDeliverError(null);

    startUploadTransition(async () => {
      const formData = new FormData();
      formData.set("requestId", requestId);
      formData.set("orderId", order.id);
      formData.set("deliverableZip", selectedFile);

      const result = await uploadPmDeliverableZip(formData);
      if (!result.success) {
        setUploadError(result.error ?? "Failed to upload deliverable.");
        return;
      }

      setSelectedFile(null);
      setInputKey((value) => value + 1);
      router.refresh();
    });
  }

  function handleDeliver() {
    if (!order?.id) {
      setDeliverError("Start the task before delivering files.");
      return;
    }

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

  return (
    <Card className="flex shrink-0 flex-col overflow-hidden">
      <CardHeader className="sticky top-0 z-10 shrink-0 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85">
        <CardTitle>Delivery</CardTitle>
      </CardHeader>
      <CardContent className="hide-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto">
        {!order ? (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            Start the translation task before uploading the translated ZIP.
          </p>
        ) : (
          <>
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
                Order status
              </p>
              <div className="text-sm">{titleCaseStatus(order.status)}</div>
            </div>

            {canUpload ? (
              <div className="space-y-3">
                <FileUploadField
                  accept=".zip,application/zip,application/x-zip-compressed"
                  buttonLabel="Choose ZIP"
                  description="Upload the translated delivery package for requester review."
                  disabled={isUploading || isDelivering}
                  inputKey={inputKey}
                  label="Translated ZIP"
                  selectedFile={selectedFile}
                  onFileChange={setSelectedFile}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={isUploading || isDelivering}
                  onClick={handleUpload}
                >
                  {isUploading ? "Uploading..." : draftDeliverables.length ? "Replace draft ZIP" : "Upload ZIP"}
                </Button>
                {uploadError ? <p className="text-sm text-destructive">{uploadError}</p> : null}
              </div>
            ) : (
              <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                This order has already been delivered to the requester.
              </p>
            )}

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">Deliverables</p>
                {canUpload ? (
                  <Button
                    type="button"
                    className="min-w-28"
                    disabled={!canDeliver || isDelivering}
                    onClick={handleDeliver}
                  >
                    {isDelivering ? "Delivering..." : "Deliver"}
                  </Button>
                ) : null}
              </div>

              {deliverables.length ? (
                <div className="space-y-3">
                  {deliverables.map((deliverable) => (
                    <div key={deliverable.id} className="rounded-md border p-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium">
                          {storageName(deliverable.storage_path) || "Translated ZIP"}
                        </span>
                        <StatusBadge status={deliverable.status} />
                      </div>
                      <p className="mt-2 text-muted-foreground">
                        {titleCaseStatus(deliverable.taskType)} · v{deliverable.version_no ?? 1}
                        {deliverable.language ? ` · ${deliverable.language.toUpperCase()}` : ""}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Uploaded {formatDate(deliverable.created_at)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                  No translated ZIP has been uploaded yet.
                </p>
              )}

              {deliverError ? <p className="text-sm text-destructive">{deliverError}</p> : null}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function storageName(path?: string | null) {
  if (!path) {
    return "";
  }

  const parts = path.split("/");
  return parts[parts.length - 1] ?? "";
}
