import JSZip from "jszip";
import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

type DeliverableRow = {
  id: string;
  storage_bucket: string;
  storage_path: string;
  status?: string | null;
  jurisdiction_code?: string | null;
};

type OrderRow = {
  id: string;
  order_no?: string | null;
  translation_tasks?: Array<{
    id: string;
    task_deliverables?: DeliverableRow[] | null;
  }> | null;
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ requestId: string }> },
) {
  const { requestId } = await params;
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;

  if (claimsError || !userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, order_no, requester_id, translation_tasks(id, task_deliverables(id, storage_bucket, storage_path, status, jurisdiction_code))")
    .eq("request_id", requestId)
    .eq("requester_id", userId)
    .maybeSingle();

  if (orderError) {
    return NextResponse.json({ error: orderError.message }, { status: 500 });
  }
  if (!order) {
    return NextResponse.json({ error: "Deliverables not found" }, { status: 404 });
  }

  const deliverables = (((order.translation_tasks ?? []) as OrderRow["translation_tasks"]) ?? [])
    .flatMap((task) => task.task_deliverables ?? [])
    .filter((deliverable) => deliverable.status && deliverable.status !== "draft");

  if (!deliverables.length) {
    return NextResponse.json({ error: "No deliverables are available" }, { status: 404 });
  }

  const zip = new JSZip();
  const usedFileNames = new Set<string>();
  const failures: string[] = [];

  for (const deliverable of deliverables) {
    const archiveName = uniqueArchiveName(deliverable, usedFileNames);
    const { data, error } = await supabase.storage
      .from(deliverable.storage_bucket)
      .download(deliverable.storage_path);

    if (error) {
      failures.push(`${archiveName}: ${error.message}`);
      continue;
    }

    zip.file(archiveName, new Uint8Array(await data.arrayBuffer()));
  }

  if (failures.length === deliverables.length) {
    return NextResponse.json(
      { error: failures[0] ?? "Unable to prepare deliverables." },
      { status: 500 },
    );
  }
  if (failures.length) {
    zip.file("_download-errors.txt", failures.join("\n"));
  }

  const archive = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  const baseName = safeBaseName(order.order_no ?? requestId);

  return new NextResponse(Buffer.from(archive), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${baseName}-deliverables.zip"`,
      "Cache-Control": "private, no-store",
    },
  });
}

function uniqueArchiveName(
  deliverable: DeliverableRow,
  usedNames: Set<string>,
) {
  const sourceName = storageName(deliverable.storage_path) || "delivery-file";
  const jurisdiction = safeBaseName(deliverable.jurisdiction_code ?? "GENERAL");
  const candidate = `${jurisdiction}-${sourceName}`;
  const extensionIndex = candidate.lastIndexOf(".");
  const stem = extensionIndex > 0 ? candidate.slice(0, extensionIndex) : candidate;
  const extension = extensionIndex > 0 ? candidate.slice(extensionIndex) : "";
  let uniqueName = candidate;
  let suffix = 2;

  while (usedNames.has(uniqueName)) {
    uniqueName = `${stem}-${suffix}${extension}`;
    suffix += 1;
  }

  usedNames.add(uniqueName);
  return uniqueName;
}

function safeBaseName(value: string) {
  return value
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "request";
}

function storageName(path?: string | null) {
  const parts = path?.split("/") ?? [];
  return parts[parts.length - 1] ?? "";
}
