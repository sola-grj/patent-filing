import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import type { WizardConfig, WizardPayload } from "@/features/requester/wizard-types";
import { getEpoServiceAvailability } from "@/features/requester/deadlines";

import { getErpCountries, getErpPrice } from "./client";
import { erpQuoteCurrency } from "./types";
import {
  buildErpPriceRequest,
  categoryForConfig,
  quoteAvailabilityError,
  validatePriceRows,
  verifiedClaimMetrics,
} from "./pricing-rules";
import type {
  ErpActionResult,
  ErpCountry,
  ErpPriceRequest,
  ErpQuotePreview,
  ErpQuoteResult,
} from "./types";

const LANGUAGE_SHORT_NAMES: Record<string, string> = {
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
  bg: "bg-BG",
  hr: "hr-HR",
  cs: "cs-CZ",
  da: "da-DK",
  nl: "nl-NL",
  et: "et-EE",
  fi: "fi-FI",
  el: "el-GR",
  hu: "hu-HU",
  ga: "ga-IE",
  it: "it-IT",
  lv: "lv-LV",
  lt: "lt-LT",
  mt: "mt-MT",
  pl: "pl-PL",
  pt: "pt-PT",
  ro: "ro-RO",
  sk: "sk-SK",
  sl: "sl-SI",
  es: "es-ES",
  sv: "sv-SE",
  lb: "lb-LU",
  tr: "tr-TR",
  sq: "sq-AL",
};

export async function availableErpCountries(
  config: Pick<WizardConfig, "channelCode" | "serviceTypes" | "epvType" | "epServiceType">,
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
    if (error) throw new Error("Unable to validate quote countries.");
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
  const serviceAvailability = getEpoServiceAvailability(
    payload.config.epServiceType,
    payload.selectedPatent,
    payload.analysis,
  );
  if (!serviceAvailability.available) {
    throw new Error(
      serviceAvailability.reason
      ?? "The selected EPO service is not currently available.",
    );
  }
  const availabilityError = quoteAvailabilityError(payload.config);
  if (availabilityError) throw new Error(availabilityError);
  const service = createServiceClient();
  const categoryId = categoryForConfig(payload.config)!;
  const requiresCountries = [82, 8283].includes(categoryId);
  const requiresTargets = payload.config.translationRequired
    && [83, 84, 8283].includes(categoryId);
  const [{ data: customerAccounts, error: customerError }, sourceLangId, targetLangIds, remoteCountries] =
    await Promise.all([
      service
        .from("eci_erp_customers")
        .select("client_id, auth_user_id")
        .eq("organization_id", organizationId)
        .is("sync_error", null)
        .eq("is_black", false),
      resolveSourceLangId(payload.config.sourceLanguage),
      requiresTargets ? resolveTargetLangIds(payload.config.targetLanguages) : [],
      requiresCountries ? getErpCountries(categoryId) : [],
    ]);
  const customer = customerAccounts?.find((account) => account.auth_user_id === authUserId)
    ?? (customerAccounts?.length === 1 ? customerAccounts[0] : null);
  if (customerError || !customer) {
    throw new Error("Your organization is not linked to an active customer account.");
  }
  const availableIds = new Set(remoteCountries.map((country) => country.id));
  if (requiresCountries && payload.config.epCountryIds.some((id) => !availableIds.has(id))) {
    throw new Error("One or more selected countries are not available for this service category.");
  }

  const metrics = verifiedPatentMetrics(payload, categoryId);
  const currency = erpQuoteCurrency(payload.quoteCurrency);
  const request: ErpPriceRequest = buildErpPriceRequest({
    categoryId,
    sourceLangId,
    targetLangIds,
    countryIds: payload.config.epCountryIds,
    optOutCountryIds: payload.config.optOutCountryIds,
    serviceItem: payload.config.serviceItem,
    translationRequired: payload.config.translationRequired,
    clientId: safeInteger(customer.client_id, "Client ID"),
    priceCurrencyId: currency.id,
    metrics,
  });
  const response = await getErpPrice(request);
  const validatedRows = validatePriceRows({
    categoryId,
    requestedCountryIds: request.countryIdList ?? [],
    requestedTargetLangIds: request.targetLangIds ?? [],
  }, response);
  const responseCountryIds = uniqueIntegers(validatedRows.map((row) => row.countryId));
  const responseLanguageIds = uniqueIntegers(validatedRows.flatMap((row) =>
    Object.keys(row.translationFees).map(Number)
  ));
  const [countries, languageNames] = await Promise.all([
    resolveCountryNames(responseCountryIds),
    resolveLanguageNames(responseLanguageIds),
  ]);
  const rows = validatedRows.map((row) => {
    const translationFeeDetails = Object.entries(row.translationFees).map(
      ([languageIdValue, amount]) => {
        const languageId = Number(languageIdValue);
        return {
          languageId,
          languageName: languageNames.get(languageId)!,
          amount,
        };
      },
    );
    const translationFee = roundMoney(translationFeeDetails.reduce(
      (sum, fee) => sum + fee.amount,
      0,
    ));
    return {
      ...row,
      countryName: countries.get(row.countryId)!,
      translationFee,
      translationFeeDetails,
      total: roundMoney(row.officialFee + row.serviceFee + translationFee),
    };
  });
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

function verifiedPatentMetrics(payload: WizardPayload, categoryId: number) {
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
  const claimMetrics = verifiedClaimMetrics(analysis.aggregate);
  if (categoryId === 84) return claimMetrics;

  const pageCount = patent?.totalPages
    ?? selectedFiles.reduce((sum, file) => sum + file.pageCount, 0);
  if (!Number.isInteger(pageCount) || pageCount <= 0) {
    throw new Error("Verified patent page count is missing.");
  }
  return {
    ...claimMetrics,
    patTotalPages: pageCount,
    patTotalWords: nonNegativeInteger(analysis.aggregate.total_words, "total word count"),
  };
}

async function resolveSourceLangId(sourceLanguage: string) {
  const shortName = LANGUAGE_SHORT_NAMES[sourceLanguage.trim().toLowerCase()];
  if (!shortName) throw new Error("The selected source language is not mapped to the pricing service.");
  const service = createServiceClient();
  const { data, error } = await service
    .from("patent_language_options")
    .select("id")
    .eq("short_name", shortName)
    .eq("deleted", false)
    .single();
  if (error) throw new Error("The selected source language is not available in the pricing service.");
  return data.id;
}

async function resolveTargetLangIds(targetLanguages: string[]) {
  const shortNames = targetLanguages.map((value) => {
    const shortName = LANGUAGE_SHORT_NAMES[value.trim().toLowerCase()];
    if (!shortName) throw new Error(`Target language ${value} is not mapped to the pricing service.`);
    return shortName;
  });
  if (!shortNames.length) return [];
  const service = createServiceClient();
  const { data, error } = await service
    .from("patent_language_options")
    .select("id, short_name")
    .in("short_name", shortNames)
    .eq("deleted", false);
  if (error) throw new Error("One or more target languages are not available in the pricing service.");
  const idsByShortName = new Map((data ?? []).map((option) => [option.short_name, option.id]));
  const missing = shortNames.filter((shortName) => !idsByShortName.has(shortName));
  if (missing.length) throw new Error("One or more target languages are not available in the pricing service.");
  return shortNames.map((shortName) => idsByShortName.get(shortName)!);
}

async function resolveCountryNames(ids: number[]) {
  if (!ids.length) return new Map<number, string>();
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

async function resolveLanguageNames(ids: number[]) {
  if (!ids.length) return new Map<number, string>();
  const service = createServiceClient();
  const { data, error } = await service
    .from("patent_language_options")
    .select("id, en_name, short_name")
    .eq("deleted", false)
    .in("id", ids);
  if (error) throw new Error("Unable to resolve translation languages.");
  const result = new Map((data ?? []).map((language) => [
    language.id,
    language.en_name ?? language.short_name,
  ]));
  const missing = ids.filter((id) => !result.has(id));
  if (missing.length) {
    throw new Error(`The pricing service returned unknown target languages: ${missing.join(", ")}.`);
  }
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
  return error instanceof Error ? error.message : "The pricing service is unavailable.";
}
