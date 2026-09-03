import { NextResponse } from "next/server";

import { getOptionalPortalContext } from "@/lib/auth/portal-context";
import {
  generateQuoteExport,
  quoteExportFileName,
  type QuoteExportFormat,
  type QuoteExportMetadata,
} from "@/lib/eci-erp/quote-export";
import {
  isErpQuoteCurrencyCode,
  type ErpQuotePreview,
  type ErpQuoteRow,
} from "@/lib/eci-erp/types";

export async function GET(request: Request, { params }: { params: Promise<{ quoteId: string }> }) {
  try {
    const context = await getOptionalPortalContext();
    if (!context || (!context.requesterMembership && !context.staffMembership)) {
      return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    }
    const format = exportFormat(new URL(request.url).searchParams.get("format"));
    const { quoteId } = await params;
    const { data: quote, error } = await context.supabase
      .from("quotes")
      .select("id, status, currency, total_amount, valid_until, created_at, pricing_snapshot, breakdown_json, translation_requests(request_no, title, request_patents(patent_number, title, application_no, publication_no, filing_date, publication_date, first_priority_date, language, grant_publication_date, rule_71_3_communication_date), translation_requirements(ep_service_type_code, service_item_code, translation_required, opt_out_country_ids, config_snapshot))")
      .eq("id", quoteId)
      .single();
    if (error || !quote) return NextResponse.json({ error: "Quotation not found." }, { status: 404 });
    if (!context.staffMembership && quote.status === "draft") {
      return NextResponse.json({ error: "Quotation not found." }, { status: 404 });
    }

    const exportQuote = savedQuotePreview(quote);
    if (!exportQuote) return NextResponse.json({ error: "This quotation cannot be exported." }, { status: 422 });
    const metadata = quoteMetadata(quote);
    const file = await generateQuoteExport(format, exportQuote, metadata);
    const contentType = format === "pdf"
      ? "application/pdf"
      : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    return new NextResponse(Buffer.from(file), {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${quoteExportFileName(format, exportQuote, metadata)}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to export the quotation." },
      { status: 400 },
    );
  }
}

function savedQuotePreview(quote: Record<string, unknown>): ErpQuotePreview | null {
  const currency = quote.currency;
  if (!isErpQuoteCurrencyCode(currency)) return null;
  const snapshot = asRecord(quote.breakdown_json) ?? asRecord(quote.pricing_snapshot);
  const rows = Array.isArray(snapshot?.response) ? snapshot.response.flatMap(savedRow) : [];
  if (!rows.length) return null;
  const total = finiteAmount(quote.total_amount) ?? rows.reduce((sum, row) => sum + row.total, 0);
  return {
    source: "eci_erp",
    currency,
    quotedAt: typeof snapshot?.quotedAt === "string" ? snapshot.quotedAt : String(quote.created_at),
    customerName: typeof snapshot?.customerName === "string" ? snapshot.customerName : "Pat customer",
    validUntil: typeof quote.valid_until === "string" ? quote.valid_until : undefined,
    rows,
    total,
  };
}

function savedRow(value: unknown): ErpQuoteRow[] {
  const row = asRecord(value);
  const countryId = finiteAmount(row?.countryId);
  const countryName = typeof row?.countryName === "string" ? row.countryName : null;
  const officialFee = finiteAmount(row?.officialFee);
  const serviceFee = finiteAmount(row?.serviceFee);
  const translationFee = finiteAmount(row?.translationFee);
  const total = finiteAmount(row?.total);
  if (countryId === null || !countryName || officialFee === null || serviceFee === null || translationFee === null || total === null) return [];
  const translationFeeDetails = Array.isArray(row?.translationFeeDetails) ? row.translationFeeDetails.flatMap((fee) => {
    const detail = asRecord(fee);
    const languageId = finiteAmount(detail?.languageId);
    const languageName = typeof detail?.languageName === "string" ? detail.languageName : null;
    const amount = finiteAmount(detail?.amount);
    return languageId === null || !languageName || amount === null ? [] : [{ languageId, languageName, amount }];
  }) : [];
  return [{ countryId, countryName, officialFee, serviceFee, translationFees: {}, translationFee, translationFeeDetails, total }];
}

function quoteMetadata(quote: Record<string, unknown>): QuoteExportMetadata {
  const request = firstRelation(quote.translation_requests);
  const patent = firstRelation(request?.request_patents);
  const requirement = firstRelation(request?.translation_requirements);
  const config = asRecord(requirement?.config_snapshot);
  const serviceType = stringValue(requirement?.ep_service_type_code) ?? stringValue(config?.epServiceType) ?? "traditional_validation";
  const translationRequired = typeof requirement?.translation_required === "boolean"
    ? requirement.translation_required
    : config?.translationRequired !== false;
  return {
    serviceName: serviceName(serviceType),
    serviceType,
    serviceItem: stringValue(requirement?.service_item_code) ?? stringValue(config?.serviceItem) ?? undefined,
    optOutCountryIds: numberArray(requirement?.opt_out_country_ids) ?? numberArray(config?.optOutCountryIds) ?? undefined,
    patentNumber: stringValue(patent?.patent_number) ?? stringValue(request?.request_no) ?? "patent",
    applicationNumber: stringValue(patent?.application_no) ?? stringValue(patent?.patent_number) ?? "patent",
    translationRequired,
    patentDetails: {
      title: stringValue(patent?.title) ?? stringValue(request?.title) ?? undefined,
      filingDate: stringValue(patent?.filing_date) ?? undefined,
      publicationNumber: stringValue(patent?.publication_no) ?? undefined,
      publicationDate: stringValue(patent?.publication_date) ?? undefined,
      firstPriorityDate: stringValue(patent?.first_priority_date) ?? undefined,
      publicationLanguage: stringValue(patent?.language) ?? undefined,
      grantDate: stringValue(patent?.grant_publication_date) ?? undefined,
      rule713DispatchDate: stringValue(patent?.rule_71_3_communication_date) ?? undefined,
    },
  };
}

function exportFormat(value: string | null): QuoteExportFormat {
  if (value === "pdf" || value === "xlsx") return value;
  throw new Error("The requested quotation format is not supported.");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function firstRelation(value: unknown) {
  return Array.isArray(value) ? asRecord(value[0]) : asRecord(value);
}

function finiteAmount(value: unknown) {
  const amount = typeof value === "number" || typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function numberArray(value: unknown) {
  if (!Array.isArray(value)) return null;
  return value.map(Number).filter(Number.isInteger);
}

function serviceName(serviceType: string) {
  return {
    ep_granting: "EP Granting",
    traditional_validation: "Traditional Validation",
    unitary_patent: "Unitary Patent",
    traditional_validation_unitary_patent: "Traditional Validation + Unitary Patent",
  }[serviceType] ?? "Patent service";
}
