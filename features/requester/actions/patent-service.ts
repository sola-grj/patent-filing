import type {
  WizardPatentAnalysisResult,
  WizardPatentCandidate,
  WizardPayload,
} from "@/features/requester/wizard-types";
import {
  isEpGrantingTranslation,
  isVerifiedCustomerTifg,
} from "@/features/requester/epo-tifg-upload";
import {
  mapPatentLookupResponse,
  type PatentLookupResponse,
} from "./patent-lookup";

type VerifiedPatentReceipts = {
  lookup: PatentLookupResponse;
  analysis: WizardPatentAnalysisResult;
};

export async function verifyPatentReceipts(input: {
  lookupReceipt: string;
  analysisReceipt: string;
  fallbackPatentNumber: string;
}): Promise<{
  patent: WizardPatentCandidate;
  analysis: WizardPatentAnalysisResult;
}> {
  const verified = await callPatentService<VerifiedPatentReceipts>(
    "/api/patents/receipts/verify",
    {
      lookup_receipt: input.lookupReceipt,
      analysis_receipt: input.analysisReceipt,
    },
  );
  return {
    patent: {
      ...mapPatentLookupResponse(verified.lookup, input.fallbackPatentNumber),
      lookupReceipt: input.lookupReceipt,
    },
    analysis: {
      ...verified.analysis,
      analysis_receipt: input.analysisReceipt,
    },
  };
}

export async function verifyWizardPatentPayload(
  payload: WizardPayload,
): Promise<WizardPayload> {
  if (payload.sourceMode !== "patent_search") return payload;

  const patent = payload.selectedPatent;
  const lookupReceipt = patent?.lookupReceipt;
  if (!patent || !lookupReceipt) {
    throw new Error(
      "Patent lookup verification is missing. Search the patent again before continuing.",
    );
  }

  const analysisReceipt = payload.analysis?.analysis_receipt;
  if (!analysisReceipt) {
    throw new Error(
      "Patent analysis verification is missing. Analyze the patent again before continuing.",
    );
  }

  const verified = await verifyPatentReceipts({
    lookupReceipt,
    analysisReceipt,
    fallbackPatentNumber: patent.patentNumber,
  });
  const verifiedPayload = {
    ...payload,
    selectedPatent: verified.patent,
    analysis: verified.analysis,
  };

  if (isEpGrantingTranslation(payload.config)) {
    if (!isVerifiedCustomerTifg(verified.analysis)) {
      throw new Error(
        "The uploaded TIFG must finish claims-only parsing successfully before a quote can be generated.",
      );
    }
    return verifiedPayload;
  }

  if (
    !["success", "partial"].includes(verified.analysis.status)
    || verified.analysis.aggregate.total_words <= 0
    || !verified.analysis.files.length
    || verified.analysis.files.some((file) =>
      file.status === "failed"
      || Object.values(file.parts).some((part) => part.status === "parse_failed")
    )
  ) {
    throw new Error(
      "Patent data processing has not produced usable word counts. Retry before continuing.",
    );
  }

  return verifiedPayload;
}

export async function enqueueSubmittedPatentCache(input: {
  requestId: string;
  lookupReceipt?: string;
  analysisReceipt: string;
}) {
  return callPatentService<{
    request_id: string;
    patent_id: string | null;
    status: "pending" | "processing" | "completed" | "failed";
  }>("/api/patents/cache", {
    request_id: input.requestId,
    ...(input.lookupReceipt ? { lookup_receipt: input.lookupReceipt } : {}),
    analysis_receipt: input.analysisReceipt,
    persistence_mode: "submission",
  });
}

export async function persistDraftPatentCache(input: {
  requestId: string;
  lookupReceipt: string;
  analysisReceipt: string;
}) {
  return callPatentService<{
    request_id: string;
    patent_id: string | null;
    status: "pending" | "processing" | "completed" | "failed";
  }>("/api/patents/cache", {
    request_id: input.requestId,
    lookup_receipt: input.lookupReceipt,
    analysis_receipt: input.analysisReceipt,
    persistence_mode: "draft",
  }, 120_000);
}

export async function fetchSubmittedPatentFile(requestId: string) {
  const { apiKey, baseUrl } = patentServiceConfig();
  try {
    return await fetch(
      `${baseUrl}/api/patents/cache/requests/${encodeURIComponent(requestId)}/file`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${apiKey}` },
        cache: "no-store",
        signal: AbortSignal.timeout(120_000),
      },
    );
  } catch {
    throw new Error("The patent file service is unavailable. Please retry.");
  }
}

async function callPatentService<T>(
  path: string,
  body: Record<string, unknown>,
  timeoutMs = 15_000,
): Promise<T> {
  const { apiKey, baseUrl } = patentServiceConfig();
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new Error("The patent service is unavailable. Please retry.");
  }

  const payload = await response.json().catch(() => null) as {
    error?: { message?: string };
    detail?: string;
  } | null;
  if (!response.ok) {
    throw new Error(
      payload?.error?.message
      || payload?.detail
      || `The patent service rejected the request (${response.status}).`,
    );
  }
  return payload as T;
}

function patentServiceConfig() {
  const apiKey = process.env.PATENT_SERVICE_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Patent service authentication is not configured.");
  }
  const baseUrl = (
    process.env.PATENT_SERVICE_BASE_URL ?? "http://127.0.0.1:9999"
  ).replace(/\/$/, "");
  return { apiKey, baseUrl };
}
