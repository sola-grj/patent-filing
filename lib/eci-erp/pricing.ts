import "server-only";
import { unstable_cache } from "next/cache";

import { createServiceClient } from "@/lib/supabase/server";
import type { WizardConfig, WizardPayload } from "@/features/requester/wizard-types";
import { getEpoServiceAvailability } from "@/features/requester/deadlines";
import {
  isEpGrantingTranslation,
  isVerifiedCustomerTifg,
} from "@/features/requester/epo-tifg-upload";

import { getErpCountries, getErpPrice } from "./client";
import { erpQuoteCurrency } from "./types";
import { sumMoney } from "./money.ts";
import {
  applyTranslationSelection,
  buildErpPriceRequest,
  categoryForConfig,
  erpTranslationLanguageRequirements,
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

const getCachedErpCountries = unstable_cache(
  async (categoryId: number) => getErpCountries(categoryId),
  ["erp-countries-v1"],
  { revalidate: 900, tags: ["erp-countries"] },
);

export async function availableErpCountries(
  config: Pick<WizardConfig, "channelCode" | "serviceTypes" | "epvType" | "epServiceType">,
): Promise<ErpActionResult<ErpCountry[]>> {
  try {
    const categoryId = categoryForConfig(config);
    if (!categoryId) return { success: true, data: [] };
    const remoteCountries = await getCachedErpCountries(categoryId);
    const service = createServiceClient();
    const ids = uniqueIntegers(remoteCountries.map((country) => country.id));
    const { data, error } = ids.length
      ? await service
          .from("ep_countries")
          .select("id, name, cname, is_distinguish_entry, epv_trans_requirement, official_currency")
          .eq("enabled", true)
          .in("id", ids)
      : { data: [], error: null };
    if (error) throw new Error("Unable to validate quote countries.");
    const localById = new Map((data ?? []).map((country) => [country.id, country]));
    const unknownIds = ids.filter((id) => !localById.has(id));
    await recordUnknownCountries(categoryId, unknownIds);
    const mismatches: Array<{ id: number; remote: number; local: number }> = [];

    const normalizedCountries = remoteCountries.flatMap((remote) => {
        const local = localById.get(remote.id);
        const requirement = epvTranslationRequirement(remote, remote.name);
        if (local && local.epv_trans_requirement !== requirement) {
          mismatches.push({
            id: remote.id,
            remote: requirement,
            local: local.epv_trans_requirement,
          });
        }
        return local ? [{
          id: local.id,
          name: local.name,
          cname: local.cname,
          epvTransRequirement: requirement,
          isDistinguishEntry: remote.isDistinguishEntry
            ?? local.is_distinguish_entry,
          officialCurrency: remote.officialCurrency
            ?? local.official_currency,
        }] : [];
      });
    await recordCountryRequirementMismatches(categoryId, mismatches);
    return { success: true, data: normalizedCountries };
  } catch (error) {
    return { success: false, error: publicErpError(error) };
  }
}

export async function prepareQuoteForOrganization(
  payload: WizardPayload,
  organizationId: string,
  authUserId: string,
) {
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
  const [
    { data: customerAccounts, error: customerError },
    remoteCountries,
    localCountryRequirements,
  ] =
    await Promise.all([
      service
        .from("eci_erp_customers")
        .select("client_id, client_name, auth_user_id")
        .eq("organization_id", organizationId)
        .is("sync_error", null)
        .eq("is_black", false),
      requiresCountries ? getCachedErpCountries(categoryId) : [],
      requiresCountries
        ? resolveLocalCountryRequirements(payload.config.epCountryIds)
        : new Map<number, number>(),
    ]);
  const customer = customerAccounts?.find((account) => account.auth_user_id === authUserId)
    ?? (customerAccounts?.length === 1 ? customerAccounts[0] : null);
  if (customerError || !customer) {
    throw new Error("Your organization is not linked to an active customer account.");
  }
  const remoteById = new Map(remoteCountries.map((country) => [country.id, country]));
  const availableIds = new Set(remoteById.keys());
  if (requiresCountries && payload.config.epCountryIds.some((id) => !availableIds.has(id))) {
    throw new Error("One or more selected countries are not available for this service category.");
  }
  const countryRequirements: Record<number, 0 | 1 | 2> = {};
  const requirementMismatches: Array<{ id: number; remote: number; local: number }> = [];
  for (const countryId of payload.config.epCountryIds) {
    const remote = remoteById.get(countryId)!;
    const requirement = epvTranslationRequirement(remote, remote.name);
    countryRequirements[countryId] = requirement;
    const localRequirement = localCountryRequirements.get(countryId);
    if (localRequirement !== undefined && localRequirement !== requirement) {
      requirementMismatches.push({
        id: countryId,
        remote: requirement,
        local: localRequirement,
      });
    }
  }
  await recordCountryRequirementMismatches(categoryId, requirementMismatches);
  const languageRequirements = erpTranslationLanguageRequirements(
    categoryId,
    payload.config.translationRequired,
    countryRequirements,
  );
  const [sourceLangId, targetLangIds] = await Promise.all([
    languageRequirements.source
      ? resolveSourceLangId(payload.config.sourceLanguage)
      : undefined,
    languageRequirements.target
      ? resolveTargetLangIds(payload.config.targetLanguages)
      : [],
  ]);

  const metrics = verifiedPatentMetrics(payload, categoryId);
  const currency = erpQuoteCurrency(payload.quoteCurrency);
  const request: ErpPriceRequest = buildErpPriceRequest({
    categoryId,
    sourceLangId,
    targetLangIds,
    countryIds: payload.config.epCountryIds,
    serviceItem: payload.config.serviceItem,
    translationRequired: payload.config.translationRequired,
    countryRequirements,
    clientId: safeInteger(customer.client_id, "Client ID"),
    priceCurrencyId: currency.id,
    metrics,
  });
  return {
    request,
    currency: currency.code,
    customerName: customer.client_name,
    ...(payload.config.epServiceType === "ep_granting" && serviceAvailability.deadline
      ? { validUntil: serviceAvailability.deadline }
      : {}),
  };
}

export async function executeErpQuote(input: {
  request: ErpPriceRequest;
  currency: ErpQuotePreview["currency"];
  customerName: string;
  translationRequired: boolean;
  validUntil?: string;
}): Promise<ErpQuoteResult> {
  const { request } = input;
  const categoryId = request.categoryId;
  const response = await getErpPrice(request);
  const validatedRows = validatePriceRows({
    categoryId,
    requestedCountryIds: request.countryIdList ?? [],
    requestedTargetLangIds: request.targetLangIds ?? [],
  }, response);
  const quoteRows = applyTranslationSelection(validatedRows, input.translationRequired);
  const responseCountryIds = uniqueIntegers(quoteRows.map((row) => row.countryId));
  const responseLanguageIds = uniqueIntegers(quoteRows.flatMap((row) =>
    Object.keys(row.translationFees).map(Number)
  ));
  const [countries, languageNames] = await Promise.all([
    resolveCountryNames(responseCountryIds),
    resolveLanguageNames(responseLanguageIds),
  ]);
  const rows = quoteRows.map((row) => {
    const translationFeeDetails = Object.entries(row.translationFees).map(
      ([languageIdValue, amount]) => {
        const languageId = Number(languageIdValue);
        const feeAmount = Number(amount);
        return {
          languageId,
          languageName: languageNames.get(languageId)!,
          amount: feeAmount,
        };
      },
    );
    const translationFee = sumMoney(
      translationFeeDetails.map((fee) => fee.amount),
    );
    return {
      ...row,
      countryName: countries.get(row.countryId)!,
      translationFee,
      translationFeeDetails,
      total: sumMoney([row.officialFee, row.serviceFee, translationFee]),
    };
  });
  return {
    source: "eci_erp",
    currency: input.currency,
    quotedAt: new Date().toISOString(),
    customerName: input.customerName,
    ...(input.validUntil ? { validUntil: input.validUntil } : {}),
    request,
    response: quoteRows,
    rows,
    total: sumMoney(rows.map((row) => row.total)),
  };
}

export function publicQuote(result: ErpQuoteResult): ErpQuotePreview {
  return {
    source: result.source,
    currency: result.currency,
    quotedAt: result.quotedAt,
    customerName: result.customerName,
    ...(result.validUntil ? { validUntil: result.validUntil } : {}),
    request: result.request,
    response: result.response,
    rows: result.rows,
    total: result.total,
  };
}

function verifiedPatentMetrics(payload: WizardPayload, categoryId: number) {
  if (categoryId === 84 && !payload.config.translationRequired) {
    return {};
  }
  const analysis = payload.analysis;
  if (
    isEpGrantingTranslation(payload.config)
    && !isVerifiedCustomerTifg(analysis)
  ) {
    throw new Error(
      "The uploaded TIFG must finish claims-only parsing successfully before a quote can be generated.",
    );
  }
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
  if (categoryId === 84) {
    return { patClaimWords: claimMetrics.patClaimWords };
  }

  const pageCount = patent?.totalPages
    ?? selectedFiles.reduce((sum, file) => sum + file.pageCount, 0);
  if (!Number.isInteger(pageCount) || pageCount <= 0) {
    if ([82, 83, 8283].includes(categoryId)) {
      return {
        ...claimMetrics,
        patTotalWords: nonNegativeInteger(analysis.aggregate.total_words, "total word count"),
      };
    }
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

async function resolveLocalCountryRequirements(ids: number[]) {
  if (!ids.length) return new Map<number, number>();
  const service = createServiceClient();
  const { data, error } = await service
    .from("ep_countries")
    .select("id, epv_trans_requirement")
    .eq("enabled", true)
    .in("id", ids);
  if (error) throw new Error("Unable to validate EPV translation requirements locally.");
  return new Map((data ?? []).map((country) => [
    country.id,
    country.epv_trans_requirement,
  ]));
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

async function recordCountryRequirementMismatches(
  categoryId: number,
  mismatches: Array<{ id: number; remote: number; local: number }>,
) {
  if (!mismatches.length) return;
  const service = createServiceClient();
  await service.from("eci_erp_integration_errors").insert(mismatches.map((item) => ({
    operation: "countries",
    external_identifier: String(item.id),
    error_code: "epv_translation_requirement_mismatch",
    detail: {
      categoryId,
      remoteRequirement: item.remote,
      localRequirement: item.local,
    },
  })));
}

function epvTranslationRequirement(
  country: Pick<ErpCountry, "id" | "name"> & Partial<ErpCountry>,
  label: string,
): 0 | 1 | 2 {
  const value = country.epvTransRequirement;
  if (value !== 0 && value !== 1 && value !== 2) {
    throw new Error(`${label || `Country ${country.id}`} returned an invalid EPV translation requirement.`);
  }
  return value;
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


function publicErpError(error: unknown) {
  return error instanceof Error ? error.message : "The pricing service is unavailable.";
}
