import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

type DeliverableRow = {
  id: string;
  storage_bucket: string;
  storage_path: string;
  status?: string | null;
};

type OrderRow = {
  id: string;
  order_no?: string | null;
  requester_id?: string | null;
  translation_tasks?: Array<{
    id: string;
    task_deliverables?: DeliverableRow[] | null;
  }> | null;
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ orderId: string; deliverableId: string }> },
) {
  const { orderId, deliverableId } = await params;
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;

  if (claimsError || !userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, order_no, requester_id, translation_tasks(id, task_deliverables(id, storage_bucket, storage_path, status))")
    .eq("id", orderId)
    .maybeSingle();

  if (orderError) {
    return NextResponse.json({ error: orderError.message }, { status: 500 });
  }

  if (!order || order.requester_id !== userId) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const deliverable = (((order.translation_tasks ?? []) as OrderRow["translation_tasks"]) ?? [])
    .flatMap((task) => task?.task_deliverables ?? [])
    .find((item) => item.id === deliverableId);

  if (!deliverable || deliverable.status === "draft") {
    return NextResponse.json({ error: "Deliverable not found" }, { status: 404 });
  }

  const { data, error: downloadError } = await supabase.storage
    .from(deliverable.storage_bucket)
    .download(deliverable.storage_path);

  if (downloadError) {
    return NextResponse.json({ error: downloadError.message }, { status: 500 });
  }

  const fileName = `${safeBaseName(order.order_no ?? orderId)}-${storageName(deliverable.storage_path) || "deliverable.zip"}`;

  return new NextResponse(await data.arrayBuffer(), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}

function safeBaseName(value: string) {
  return value.replace(/[^a-zA-Z0-9-_]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "order";
}

function storageName(path?: string | null) {
  if (!path) {
    return "";
  }

  const parts = path.split("/");
  return parts[parts.length - 1] ?? "";
}
