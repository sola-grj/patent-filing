import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RequesterHeader } from "@/features/requester/components/requester-header";
import {
  StatusBadge,
  formatCurrency,
  formatDate,
  titleCaseStatus,
} from "@/features/requester/format";
import { getRequesterOrder } from "@/features/requester/queries";

type TaskDeliverable = {
  id: string;
  version_no?: number | null;
  status?: string | null;
  storage_path?: string | null;
  created_at?: string | null;
  language?: string | null;
};

type OrderTask = {
  id: string;
  task_type: string;
  status: string;
  task_deliverables?: TaskDeliverable[] | null;
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
  const deliverables = tasks
    .flatMap((task) =>
      (task.task_deliverables ?? [])
        .filter(
          (deliverable) => deliverable.status && deliverable.status !== "draft",
        )
        .map((deliverable) => ({
          ...deliverable,
          taskType: task.task_type,
          taskStatus: task.status,
        })),
    )
    .sort((left, right) => {
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
                  <p className="font-medium">
                    {storageName(deliverable.storage_path) || "Upload ZIP"}
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
                <Button asChild variant="outline">
                  <a
                    href={`/requester/orders/${orderId}/deliverables/${deliverable.id}`}
                  >
                    Download ZIP
                  </a>
                </Button>
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
