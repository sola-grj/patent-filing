import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import type { WizardConfig, WizardPayload } from "@/features/requester/wizard-types";

import { getErpCountries, getErpPrice } from "./client";
import { erpQuoteCurrency } from "./types";
import {
  categoryForConfig,
  quoteAvailabilityError,
  validatePriceRows,
} from "./pricing-rules";
import type {
  ErpActionResult,
  ErpCountry,
  ErpPriceRequest,
  ErpQuotePreview,
  ErpQuoteResult,
} from "./types";

const SOURCE_LANGUAGE_SHORT_NAMES: Record<string, string> = {
  "zh-cn": "zh-CN",
  zh: "zh-CN",
  en: "en-US",
  "en-us": "en-US",
  ja: "ja-JP",
  "ja-jp": "ja-JP",
  ko: "ko-KR",
  "ko-kr": "ko-KR",
  de: "de-DE",
  "de-de": "de-DE",
  fr: "fr-FR",
  "fr-fr": "fr-FR",
};

export async function availableErpCountries(
  config: Pick<WizardConfig, "channelCode" | "serviceTypes" | "epvType">,
): Promise<ErpActionResult<ErpCountry[]>> {
  try {
    const categoryId = categoryForConfig(config);
    if (!categoryId) return { success: true, data: [] };
    const remoteCountries = await getErpCountries(categoryId);
    const service = createServiceClient();
    const ids = uniqueIntegers(remoteCountries.map((country) => country.id));
    const { data, error } = ids.length
      ? await service
          .from("ep_countries")
          .select("id, name, cname, is_distinguish_entry, official_currency")
          .eq("enabled", true)
          .in("id", ids)
      : { data: [], error: null };
    if (error) throw new Error("Unable to validate ERP countries.");
    const localById = new Map((data ?? []).map((country) => [country.id, country]));
    const unknownIds = ids.filter((id) => !localById.has(id));
    await recordUnknownCountries(categoryId, unknownIds);

    return {
      success: true,
      data: remoteCountries.flatMap((remote) => {
        const local = localById.get(remote.id);
        return local ? [{
          id: local.id,
          name: local.name,
          cname: local.cname,
          isDistinguishEntry: remote.isDistinguishEntry
            ?? local.is_distinguish_entry,
          officialCurrency: remote.officialCurrency
            ?? local.official_currency,
        }] : [];
      }),
    };
  } catch (error) {
    return { success: false, error: publicErpError(error) };
  }
}

export async function quoteForOrganization(
  payload: WizardPayload,
  organizationId: string,
  authUserId: string,
): Promise<ErpQuoteResult> {
  const availabilityError = quoteAvailabilityError(payload.config);
  if (availabilityError) throw new Error(availabilityError);
  if (!payload.config.epCountryIds.length) {
    throw new Error("Select at least one ERP-supported country.");
  }

  const service = createServiceClient();
  const categoryId = categoryForConfig(payload.config)!;
  const [{ data: customerAccounts, error: customerError }, sourceLangId, countries, remoteCountries] =
    await Promise.all([
      service
        .from("eci_erp_customers")
        .select("client_id, auth_user_id")
        .eq("organization_id", organizationId)
        .is("sync_error", null)
        .eq("is_black", false),
      resolveSourceLangId(payload.config.sourceLanguage),
      resolveCountryNames(payload.config.epCountryIds),
      getErpCountries(categoryId),
    ]);
  const customer = customerAccounts?.find((account) => account.auth_user_id === authUserId)
    ?? (customerAccounts?.length === 1 ? customerAccounts[0] : null);
  if (customerError || !customer) {
    throw new Error("Your organization is not linked to an active ECI ERP customer.");
  }
  const availableIds = new Set(remoteCountries.map((country) => country.id));
  if (payload.config.epCountryIds.some((id) => !availableIds.has(id))) {
    throw new Error("One or more selected countries are not available for this ERP service category.");
  }

  const metrics = verifiedPatentMetrics(payload);
  const currency = erpQuoteCurrency(payload.quoteCurrency);
  const request: ErpPriceRequest = {
    categoryId,
    sourceLangId,
    countryIdList: payload.config.epCountryIds,
    clientId: safeInteger(customer.client_id, "ERP client ID"),
    priceCurrencyId: currency.id,
    ...metrics,
  };
  const response = await getErpPrice(request);
  const rows = validatePriceRows(request.countryIdList, response).map((row) => ({
    ...row,
    countryName: countries.get(row.countryId)!,
    total: roundMoney(row.officialFee + row.serviceFee + row.translationFee),
  }));
  return {
    source: "eci_erp",
    currency: currency.code,
    quotedAt: new Date().toISOString(),
    request,
    rows,
    total: roundMoney(rows.reduce((sum, row) => sum + row.total, 0)),
  };
}

export function publicQuote(result: ErpQuoteResult): ErpQuotePreview {
  return {
    source: result.source,
    currency: result.currency,
    quotedAt: result.quotedAt,
    rows: result.rows,
    total: result.total,
  };
}

function verifiedPatentMetrics(payload: WizardPayload) {
  const analysis = payload.analysis;
  if (!analysis || !["success", "partial"].includes(analysis.status)) {
    throw new Error("Verified patent analysis is required for an online quote.");
  }
  if (payload.sourceMode === "upload") {
    throw new Error(
      "Online quote requires verified page and claim counts; uploaded files do not provide them yet.",
    );
  }
  const patent = payload.selectedPatent;
  const selectedFiles = patent?.downloadableFiles.filter((file) =>
    payload.selectedPatentFileIds.includes(file.id)
  ) ?? [];
  const pageCount = patent?.totalPages
    ?? selectedFiles.reduce((sum, file) => sum + file.pageCount, 0);
  const claimCount = patent?.claimsCount
    ?? selectedFiles.reduce((sum, file) => sum + file.claimCount, 0);
  if (!Number.isInteger(pageCount) || pageCount <= 0) {
    throw new Error("Verified patent page count is missing.");
  }
  if (!Number.isInteger(claimCount) || claimCount < 0) {
    throw new Error("Verified patent claim count is missing.");
  }
  return {
    patClaims: claimCount,
    patTotalPages: pageCount,
    patTotalWords: nonNegativeInteger(analysis.aggregate.total_words, "total word count"),
    patClaimWords: nonNegativeInteger(analysis.aggregate.claims_words, "claim word count"),
  };
}

async function resolveSourceLangId(sourceLanguage: string) {
  const shortName = SOURCE_LANGUAGE_SHORT_NAMES[sourceLanguage.trim().toLowerCase()];
  if (!shortName) throw new Error("The selected source language is not mapped to ECI ERP.");
  const service = createServiceClient();
  const { data, error } = await service
    .from("patent_language_options")
    .select("language_id")
    .eq("short_name", shortName)
    .eq("deleted", false)
    .single();
  if (error) throw new Error("The selected source language is not available in ECI ERP.");
  return data.language_id;
}

async function resolveCountryNames(ids: number[]) {
  const service = createServiceClient();
  const { data, error } = await service
    .from("ep_countries")
    .select("id, name")
    .eq("enabled", true)
    .in("id", ids);
  if (error) throw new Error("Unable to validate the selected countries.");
  const result = new Map((data ?? []).map((country) => [country.id, country.name]));
  const missing = ids.filter((id) => !result.has(id));
  if (missing.length) throw new Error("One or more selected countries are not supported locally.");
  return result;
}

async function recordUnknownCountries(categoryId: number, ids: number[]) {
  if (!ids.length) return;
  const service = createServiceClient();
  await service.from("eci_erp_integration_errors").insert(ids.map((id) => ({
    operation: "countries",
    external_identifier: String(id),
    error_code: "unknown_country_id",
    detail: { categoryId },
  })));
}

function uniqueIntegers(values: number[]) {
  return [...new Set(values.filter((value) => Number.isInteger(value) && value > 0))];
}

function safeInteger(value: unknown, label: string) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error(`${label} is invalid.`);
  return number;
}

function nonNegativeInteger(value: number, label: string) {
  if (!Number.isInteger(value) || value < 0) throw new Error(`Verified ${label} is invalid.`);
  return value;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function publicErpError(error: unknown) {
  return error instanceof Error ? error.message : "ECI ERP is unavailable.";
}
