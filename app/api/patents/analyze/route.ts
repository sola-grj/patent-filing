import { NextResponse } from "next/server";

type StreamingRequestInit = RequestInit & {
  duplex: "half";
};

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type");
  const baseUrl = (process.env.PATENT_SERVICE_BASE_URL ?? "http://127.0.0.1:9999")
    .replace(/\/$/, "");

  try {
    const requestInit: StreamingRequestInit = {
      method: "POST",
      headers: contentType ? { "content-type": contentType } : undefined,
      body: request.body,
      cache: "no-store",
      signal: request.signal,
      duplex: "half",
    };
    const upstream = await fetch(`${baseUrl}/api/patents/analyze`, requestInit);

    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") ?? "application/json",
      },
    });
  } catch (error) {
    if (request.signal.aborted || isAbortError(error)) {
      return new Response(null, { status: 499 });
    }

    return NextResponse.json(
      { detail: "Patent analysis service is unavailable." },
      { status: 502 },
    );
  }
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}
