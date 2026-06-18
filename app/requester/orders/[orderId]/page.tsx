import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RequesterHeader } from "@/features/requester/components/requester-header";
import { StatusBadge, formatCurrency, formatDate } from "@/features/requester/format";
import { getRequesterOrder } from "@/features/requester/queries";

type OrderTask = {
  id: string;
  task_type: string;
  status: string;
  task_deliverables?: unknown[];
};

export default function OrderDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading order...</p>}>
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

  return (
    <div className="space-y-8">
      <RequesterHeader title={order.order_no} description={order.translation_requests?.title ?? "Patent translation order"} />
      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardHeader><CardTitle>Status</CardTitle></CardHeader><CardContent><StatusBadge status={order.status} /></CardContent></Card>
        <Card><CardHeader><CardTitle>Amount</CardTitle></CardHeader><CardContent>{formatCurrency(order.quotes?.total_amount, order.quotes?.currency)}</CardContent></Card>
        <Card><CardHeader><CardTitle>Delivery</CardTitle></CardHeader><CardContent>{formatDate(order.quotes?.estimated_delivery_at)}</CardContent></Card>
        <Card><CardHeader><CardTitle>Confirmed</CardTitle></CardHeader><CardContent>{formatDate(order.confirmed_at)}</CardContent></Card>
      </div>
      <Card>
        <CardHeader><CardTitle>Deliverables</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {tasks.flatMap((task) => task.task_deliverables ?? []).length ? (
            tasks.map((task) => (
              <div key={task.id} className="rounded-md border p-3 text-sm">
                <strong>{task.task_type}</strong>
                <p className="text-muted-foreground">{task.status}</p>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No deliverables have been uploaded yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
