import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { latestPublishedDeliverables } from "@/features/deliverables/delivery-progress";
import { DeliverableDownloadButton } from "@/features/requester/components/deliverable-download-button";
import { RequesterHeader } from "@/features/requester/components/requester-header";
import {
  StatusBadge,
  formatCurrency,
  formatDate,
  titleCaseStatus,
} from "@/features/requester/format";
import { getRequesterOrder } from "@/features/requester/queries";
import { jurisdictionOptions } from "@/features/requester/options";

type TaskDeliverable = {
  id: string;
  version_no?: number | null;
  status?: string | null;
  storage_path?: string | null;
  created_at?: string | null;
  language?: string | null;
  jurisdiction_code?: string | null;
};

type OrderTask = {
  id: string;
  task_type: string;
  status: string;
  task_deliverables?: TaskDeliverable[] | null;
};

type DeliveryRequest = {
  translation_requirements?: {
    jurisdiction_codes?: string[] | null;
    config_snapshot?: { jurisdictionCodes?: string[] | null } | null;
  } | Array<{
    jurisdiction_codes?: string[] | null;
    config_snapshot?: { jurisdictionCodes?: string[] | null } | null;
  }> | null;
  request_config_versions?: Array<{
    version_no?: number | null;
    config_snapshot?: { jurisdictionCodes?: string[] | null } | null;
  }> | null;
};

export default function OrderDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  return (
    <Suspense
      fallback={
        <p className="text-sm text-muted-foreground">Loading order...</p>
      }
    >
      <OrderContent params={params} />
    </Suspense>
  );
}

async function OrderContent({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const order = await getRequesterOrder(orderId);

  if (!order) notFound();
  const tasks = (order.translation_tasks ?? []) as OrderTask[];
  const jurisdictionCodes = resolveOrderJurisdictionCodes(
    order.translation_requests as DeliveryRequest | null,
  );
  const jurisdictionOrder = new Map(
    jurisdictionCodes.map((code, index) => [code, index]),
  );
  const deliverables = latestPublishedDeliverables(tasks
    .flatMap((task) =>
      (task.task_deliverables ?? [])
        .map((deliverable) => ({
          ...deliverable,
          taskType: task.task_type,
          taskStatus: task.status,
        })),
    ))
    .sort((left, right) => {
      const countryDifference = jurisdictionRank(
        left.jurisdiction_code,
        jurisdictionOrder,
      ) - jurisdictionRank(right.jurisdiction_code, jurisdictionOrder);
      if (countryDifference) return countryDifference;
      const rightTime = new Date(right.created_at ?? 0).getTime();
      const leftTime = new Date(left.created_at ?? 0).getTime();
      return rightTime - leftTime;
    });

  return (
    <div className="space-y-8">
      <RequesterHeader
        title={order.order_no}
        description={
          order.translation_requests?.title ?? "Patent translation order"
        }
      />
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle>Status</CardTitle>
          </CardHeader>
          <CardContent>
            <StatusBadge status={order.status} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Amount</CardTitle>
          </CardHeader>
          <CardContent>
            {formatCurrency(order.quotes?.total_amount, order.quotes?.currency)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Delivery</CardTitle>
          </CardHeader>
          <CardContent>
            {formatDate(order.quotes?.estimated_delivery_at)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Confirmed</CardTitle>
          </CardHeader>
          <CardContent>{formatDate(order.confirmed_at)}</CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Deliverables</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {deliverables.length ? (
            deliverables.map((deliverable) => (
              <div
                key={deliverable.id}
                className="flex flex-col gap-3 rounded-md border p-4 text-sm md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <p className="font-semibold">
                    {jurisdictionLabel(deliverable.jurisdiction_code)}
                    {deliverable.jurisdiction_code
                      ? ` (${deliverable.jurisdiction_code})`
                      : ""}
                  </p>
                  <p className="mt-1 font-medium">
                      {storageName(deliverable.storage_path) || "Delivery file"}
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    {titleCaseStatus(deliverable.taskType)} · v
                    {deliverable.version_no ?? 1}
                    {deliverable.language
                      ? ` · ${deliverable.language.toUpperCase()}`
                      : ""}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {titleCaseStatus(deliverable.status)} · Uploaded{" "}
                    {formatDate(deliverable.created_at)}
                  </p>
                </div>
                <DeliverableDownloadButton
                  href={`/requester/orders/${orderId}/deliverables/${deliverable.id}`}
                />
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              No deliverables have been uploaded yet.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function storageName(path?: string | null) {
  if (!path) {
    return "";
  }

  const parts = path.split("/");
  return parts[parts.length - 1] ?? "";
}

function resolveOrderJurisdictionCodes(request?: DeliveryRequest | null) {
  if (!request) return [];
  const requirement = firstRelation(request.translation_requirements);
  const latestSnapshot = [...(request.request_config_versions ?? [])]
    .sort((left, right) => Number(right.version_no ?? 0) - Number(left.version_no ?? 0))[0]
    ?.config_snapshot ?? requirement?.config_snapshot;
  const snapshotCodes = normalizeJurisdictionCodes(latestSnapshot?.jurisdictionCodes);
  const storedCodes = normalizeJurisdictionCodes(requirement?.jurisdiction_codes);
  return snapshotCodes.length ? snapshotCodes : storedCodes;
}

function normalizeJurisdictionCodes(value?: string[] | null) {
  return [...new Set(
    (value ?? [])
      .map((code) => code.trim().toUpperCase())
      .filter((code) => /^[A-Z]{2}$/.test(code)),
  )];
}

function jurisdictionRank(
  code: string | null | undefined,
  order: Map<string, number>,
) {
  if (!code) return Number.MAX_SAFE_INTEGER;
  return order.get(code) ?? Number.MAX_SAFE_INTEGER - 1;
}

function jurisdictionLabel(code?: string | null) {
  if (!code) return "General";
  return jurisdictionOptions.find((option) => option.value === code)?.label ?? code;
}

function firstRelation<T>(value?: T | T[] | null) {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}
