import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { reconcileRequesterNotifications } from "@/features/requester/notification-reconciliation";

export async function GET(request: Request) {
  if (!isAuthorized(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await reconcileRequesterNotifications());
  } catch (error) {
    console.error("Requester notification reconciliation failed", error);
    return NextResponse.json(
      { error: "Requester notification reconciliation failed." },
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
