import { NextResponse } from "next/server";

import { validateWizardPayload } from "@/features/requester/components/new-request-wizard-utils";
import type { WizardPayload } from "@/features/requester/wizard-types";
import { quoteForOrganization, publicQuote } from "@/lib/eci-erp/pricing";
import {
  generateQuoteExport,
  quoteExportFileName,
  type QuoteExportFormat,
} from "@/lib/eci-erp/quote-export";
import { createClient } from "@/lib/supabase/server";

const MAX_EXPORT_BODY_BYTES = 2_000_000;

const serviceNames: Record<string, string> = {
  ep_granting: "EP Granting",
  traditional_validation: "Traditional Validation",
  unitary_patent: "Unitary Patent",
  traditional_validation_unitary_patent: "Traditional Validation + Unitary Patent",
};

export async function POST(request: Request) {
  try {
    const format = exportFormat(new URL(request.url).searchParams.get("format"));
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > MAX_EXPORT_BODY_BYTES) {
      return NextResponse.json({ error: "The estimate export request is too large." }, { status: 413 });
    }

    const supabase = await createClient();
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
    const userId = claimsData?.claims?.sub;
    if (claimsError || !userId) {
      return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    }
    const { data: membership, error: membershipError } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", userId)
      .eq("role", "requester")
      .limit(1)
      .maybeSingle();
    if (membershipError || !membership) {
      return NextResponse.json({ error: "A requester organization is required." }, { status: 403 });
    }

    const body = await request.json() as unknown;
    const payload = exportPayload(body);
    const validationError = validateWizardPayload(payload);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const result = await quoteForOrganization(
      payload,
      membership.organization_id,
      userId,
    );
    const quote = publicQuote(result);
    const metadata = {
      serviceName: serviceNames[payload.config.epServiceType]
        ?? payload.config.epServiceType
        ?? "Patent service",
      patentNumber: payload.selectedPatent?.patentNumber
        ?? payload.patentQuery
        ?? "patent",
    };
    const file = await generateQuoteExport(format, quote, metadata);
    const fileName = quoteExportFileName(format, quote, metadata);
    const contentType = format === "pdf"
      ? "application/pdf"
      : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    return new NextResponse(Buffer.from(file), {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to export the estimate." },
      { status: 400 },
    );
  }
}

function exportFormat(value: string | null): QuoteExportFormat {
  if (value === "pdf" || value === "xlsx") return value;
  throw new Error("The requested estimate format is not supported.");
}

function exportPayload(value: unknown): WizardPayload {
  if (!isRecord(value) || !isRecord(value.payload)) {
    throw new Error("The estimate payload is invalid.");
  }
  const payload = value.payload;
  if (
    !isRecord(payload.config)
    || !Array.isArray(payload.config.serviceTypes)
    || !Array.isArray(payload.config.epCountryIds)
    || !Array.isArray(payload.config.optOutCountryIds)
    || !Array.isArray(payload.config.targetLanguages)
    || !Array.isArray(payload.selectedPatentFileIds)
    || !Array.isArray(payload.uploadedFiles)
  ) {
    throw new Error("The estimate payload is invalid.");
  }
  return payload as WizardPayload;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
