import { NextResponse } from "next/server";

import { validateWizardPayload } from "@/features/requester/components/new-request-wizard-utils";
import { verifyWizardPatentPayload } from "@/features/requester/actions/patent-service";
import { getRequesterDraft } from "@/features/requester/queries";
import type { WizardPayload } from "@/features/requester/wizard-types";
import { quoteForOrganization, publicQuote } from "@/lib/eci-erp/pricing";
import {
  isErpQuoteCurrencyCode,
  type ErpQuotePreview,
} from "@/lib/eci-erp/types";
import {
  generateQuoteExport,
  quoteExportFileName,
  type QuoteExportMetadata,
  type QuoteExportFormat,
} from "@/lib/eci-erp/quote-export";
import { createClient } from "@/lib/supabase/server";
import { getEpoServiceAvailability } from "@/features/requester/deadlines";

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
    const savedDraft = payload.requestId
      ? await getRequesterDraft(payload.requestId)
      : null;
    const savedPayload = savedDraft?.payload;
    const exportableSavedPayload = isWizardPayload(savedPayload)
      ? savedPayload
      : null;
    const savedQuote = exportableSavedPayload?.quotePreview;

    if (payload.requestId && !savedQuote) {
      return NextResponse.json(
        { error: "This saved draft no longer has an exportable quotation." },
        { status: 404 },
      );
    }

    let exportablePayload: WizardPayload;
    let quote: ErpQuotePreview;
    if (exportableSavedPayload && savedQuote) {
      if (!isErpQuoteCurrencyCode(payload.quoteCurrency)) {
        return NextResponse.json(
          { error: "The selected quote currency is not supported." },
          { status: 400 },
        );
      }

      // Drafts deliberately omit transient lookup receipts. Use the persisted
      // request data, but preserve the currently selected currency from the
      // browser and recalculate the export with the ERP pricing service.
      exportablePayload = {
        ...exportableSavedPayload,
        quoteCurrency: payload.quoteCurrency,
      };
      const result = await quoteForOrganization(
        exportablePayload,
        membership.organization_id,
        userId,
      );
      quote = publicQuote(result);
    } else {
      const validationError = validateWizardPayload(payload);
      if (validationError) {
        return NextResponse.json({ error: validationError }, { status: 400 });
      }

      exportablePayload = await verifyWizardPatentPayload(payload);
      const result = await quoteForOrganization(
        exportablePayload,
        membership.organization_id,
        userId,
      );
      quote = publicQuote(result);
    }

    const patent = exportablePayload.selectedPatent;
    const legalDeadline = patent && exportablePayload.config.epServiceType
      ? getEpoServiceAvailability(
          exportablePayload.config.epServiceType,
          patent,
          exportablePayload.analysis,
        ).deadline
      : undefined;
    const metadata: QuoteExportMetadata = {
      serviceName: serviceNames[exportablePayload.config.epServiceType]
        ?? exportablePayload.config.epServiceType
        ?? "Patent service",
      serviceType: exportablePayload.config.epServiceType,
      serviceItem: exportablePayload.config.serviceItem || undefined,
      optOutCountryIds: exportablePayload.config.optOutCountryIds,
      patentNumber: patent?.patentNumber
        ?? exportablePayload.patentQuery
        ?? "patent",
      applicationNumber: patent?.applicationNo
        || patent?.patentNumber
        || exportablePayload.patentQuery
        || "patent",
      translationRequired: exportablePayload.config.translationRequired,
      patentDetails: patent ? {
        title: patent.title,
        source: patent.source === "wipo" ? "wipo" : "epo",
        filingDate: patent.source === "wipo"
          ? patent.internationalFilingDate || patent.filingDate
          : patent.filingDate,
        publicationNumber: patent.publicationNo,
        publicationDate: patent.publicationDate,
        firstPriorityDate: patent.firstPriorityDate,
        publicationLanguage: patent.publicationLanguage || patent.language,
        grantDate: patent.grantPublicationDate,
        rule713DispatchDate: patent.rule713CommunicationDate,
        legalDeadline,
      } : undefined,
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
  if (!isRecord(value) || !isWizardPayload(value.payload)) {
    throw new Error("The estimate payload is invalid.");
  }
  return value.payload;
}

function isWizardPayload(value: unknown): value is WizardPayload {
  if (!isRecord(value)) return false;
  const payload = value;
  if (
    !isRecord(payload.config)
    || !Array.isArray(payload.config.serviceTypes)
    || !Array.isArray(payload.config.epCountryIds)
    || !Array.isArray(payload.config.optOutCountryIds)
    || !Array.isArray(payload.config.targetLanguages)
    || !Array.isArray(payload.selectedPatentFileIds)
    || !Array.isArray(payload.uploadedFiles)
  ) {
    return false;
  }
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
