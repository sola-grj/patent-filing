import Link from "next/link";
import { Suspense } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { RequesterHeader } from "@/features/requester/components/requester-header";
import { StatusBadge, formatCurrency, formatDate } from "@/features/requester/format";
import { getRequesterOrders } from "@/features/requester/queries";

export default function RequesterOrdersPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading orders...</p>}>
      <OrdersContent />
    </Suspense>
  );
}

async function OrdersContent() {
  const { organization, orders } = await getRequesterOrders();

  if (!organization) {
    return <RequesterHeader title="Orders" description="Create a requester workspace from the dashboard first." />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-6 overflow-hidden">
      <RequesterHeader title="My orders" description="Track accepted quotes and delivery status." />
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <CardContent className="min-h-0 flex-1 overflow-y-auto p-0">
          {orders.length ? (
            <div className="divide-y">
              {orders.map((order) => (
                <Link key={order.id} href={`/requester/orders/${order.id}`} className="grid gap-3 p-4 text-sm hover:bg-muted/50 md:grid-cols-[1fr_1fr_1fr_1fr]">
                  <strong>{order.order_no}</strong>
                  <span>{order.translation_requests?.request_no} · {order.translation_requests?.title}</span>
                  <StatusBadge status={order.status} />
                  <span className="text-right">{formatCurrency(order.quotes?.total_amount, order.quotes?.currency)}<span className="block text-muted-foreground">{formatDate(order.quotes?.estimated_delivery_at)}</span></span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="p-6 text-sm text-muted-foreground">No orders yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
