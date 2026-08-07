import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

import { NextResponse } from "next/server";
import { request as requestUpstream } from "undici";

const analysisUpstreamTimeoutMs = parseTimeoutMs(
  process.env.PATENT_ANALYSIS_UPSTREAM_TIMEOUT_MS,
);

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type");
  const baseUrl = (process.env.PATENT_SERVICE_BASE_URL ?? "http://127.0.0.1:9999")
    .replace(/\/$/, "");

  try {
    const upstream = await requestUpstream(`${baseUrl}/api/patents/analyze`, {
      method: "POST",
      headers: contentType ? { "content-type": contentType } : undefined,
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
