import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

import { NextResponse } from "next/server";
import { request as requestUpstream } from "undici";

import { createClient } from "@/lib/supabase/server";

const analysisUpstreamTimeoutMs = parseTimeoutMs(
  process.env.PATENT_ANALYSIS_UPSTREAM_TIMEOUT_MS,
);

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type");
  const analysisMode = request.headers.get("x-patent-analysis-mode");
  const baseUrl = (process.env.PATENT_SERVICE_BASE_URL ?? "http://127.0.0.1:9999")
    .replace(/\/$/, "");
  const apiKey = process.env.PATENT_SERVICE_API_KEY?.trim();

  if (!apiKey) {
    return NextResponse.json(
      { detail: "Patent analysis authentication is not configured." },
      { status: 503 },
    );
  }
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (claimsError || !userId) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }
  let organizationId: string | undefined;
  if (analysisMode === "upload") {
    const { data: membership, error: membershipError } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", userId)
      .eq("role", "requester")
      .limit(1)
      .maybeSingle();
    if (membershipError || !membership?.organization_id) {
      return NextResponse.json(
        { detail: "A requester organization is required for uploaded patent analysis." },
        { status: 403 },
      );
    }
    organizationId = membership.organization_id;
  } else if (analysisMode !== "patent_search") {
    return NextResponse.json({ detail: "Invalid patent analysis mode." }, { status: 422 });
  }

  try {
    const upstream = await requestUpstream(`${baseUrl}/api/patents/analyze`, {
      method: "POST",
      headers: {
        ...(contentType ? { "content-type": contentType } : {}),
        authorization: `Bearer ${apiKey}`,
        ...(organizationId
          ? { "x-patent-organization-id": organizationId }
          : {}),
      },
      body: request.body
        ? Readable.fromWeb(request.body as unknown as NodeReadableStream)
        : null,
      signal: request.signal,
      headersTimeout: analysisUpstreamTimeoutMs,
      bodyTimeout: analysisUpstreamTimeoutMs,
    });

    return new Response(
      Readable.toWeb(upstream.body) as unknown as ReadableStream<Uint8Array>,
      {
        status: upstream.statusCode,
        headers: {
          "content-type": readHeader(upstream.headers["content-type"]),
        },
      },
    );
  } catch (error) {
    if (request.signal.aborted || isAbortError(error)) {
      return new Response(null, { status: 499 });
    }

    console.error("Patent analysis upstream request failed", error);

    return NextResponse.json(
      { detail: "Patent analysis service is unavailable." },
      { status: 502 },
    );
  }
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function parseTimeoutMs(value: string | undefined) {
  const timeoutMs = Number(value ?? "700000");
  return Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 700_000;
}

function readHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value.join(", ") : value ?? "application/json";
}
