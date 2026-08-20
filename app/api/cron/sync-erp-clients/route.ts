import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { syncErpCustomers } from "@/lib/eci-erp/customer-sync";

export async function GET(request: Request) {
  if (!isAuthorized(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await syncErpCustomers();
    return NextResponse.json(result, { status: result.status === "partial" ? 207 : 200 });
  } catch {
    return NextResponse.json(
      { error: "ECI ERP customer sync failed." },
      { status: 500 },
    );
  }
}

function isAuthorized(value: string | null) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !value?.startsWith("Bearer ")) return false;
  const provided = Buffer.from(value.slice(7), "utf8");
  const expected = Buffer.from(secret, "utf8");
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
