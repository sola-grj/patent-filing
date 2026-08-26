import { createHash } from "node:crypto";

import type { ErpPriceRequest, ErpPriceRow } from "./types";

type ServiceConfig = {
  channelCode: string;
  serviceTypes: string[];
  epvType?: string;
  epServiceType?: string;
};

export function categoryForConfig(config: ServiceConfig): number | null {
  if (config.channelCode === "ep") {
    if (config.epServiceType === "ep_granting") return 84;
    if (config.epServiceType === "traditional_validation") return 82;
    if (config.epServiceType === "unitary_patent") return 83;
    if (config.epServiceType === "traditional_validation_unitary_patent") return 8283;
    if (config.epvType === "traditional_validation") return 82;
    if (config.epvType === "unitary_effect") return 83;
    if (config.serviceTypes.includes("european_patent_grant_registration")) return 84;
    return null;
  }
  if (config.serviceTypes.includes("annuity")) return 81;
  if (config.serviceTypes.includes("filing")) return 80;
  return null;
}

export function quoteAvailabilityError(config: ServiceConfig) {
  return categoryForConfig(config) ? null : "Online quote is not available for this service.";
}

export function optTypeForServiceItem(value?: string): 1 | 2 | 3 | 4 {
  if (value === "traditional_validation_opt_out") return 2;
  if (value === "opt_out_only") return 3;
  if (value === "opt_in_only") return 4;
  return 1;
}

export function verifiedClaimMetrics(aggregate: {
  claims_count: number;
  claims_words: number;
}) {
  if (!Number.isInteger(aggregate.claims_count) || aggregate.claims_count < 0) {
    throw new Error("Verified patent claim count is invalid.");
  }
  if (!Number.isInteger(aggregate.claims_words) || aggregate.claims_words < 0) {
    throw new Error("Verified claim word count is invalid.");
  }
  return {
    patClaims: aggregate.claims_count,
    patClaimWords: aggregate.claims_words,
  };
}

export function buildErpPriceRequest(input: {
  categoryId: number;
  sourceLangId: number;
  targetLangIds: number[];
  countryIds: number[];
  optOutCountryIds: number[];
  serviceItem?: string;
  translationRequired: boolean;
  clientId: number;
  priceCurrencyId: number;
  metrics: Pick<
    ErpPriceRequest,
    "patClaims" | "patTotalPages" | "patTotalWords" | "patClaimWords"
  >;
}): ErpPriceRequest {
  const request: ErpPriceRequest = {
    categoryId: input.categoryId,
    sourceLangId: input.sourceLangId,
    patFilingTypeId: 1,
    clientId: input.clientId,
    priceCurrencyId: input.priceCurrencyId,
    patClaims: input.metrics.patClaims,
    patClaimWords: input.metrics.patClaimWords,
  };
  if (input.categoryId === 84) {
    // TODO: Remove this temporary placeholder when the category 84 backend no longer requires it.
    request.patTotalWords = 600;
  } else {
    if (
      input.metrics.patTotalPages === undefined
      || input.metrics.patTotalWords === undefined
    ) {
      throw new Error("Verified patent page and total word metrics are required.");
    }
    request.patTotalPages = input.metrics.patTotalPages;
    request.patTotalWords = input.metrics.patTotalWords;
  }
  if ([82, 8283].includes(input.categoryId)) {
    if (!input.countryIds.length) throw new Error("Select at least one supported country.");
    const optType = optTypeForServiceItem(input.serviceItem);
    request.countryIdList = [...input.countryIds];
    request.optType = optType;
    if (optType === 2) {
      const invalidOptCountry = input.optOutCountryIds.find(
        (countryId) => !input.countryIds.includes(countryId),
      );
      if (invalidOptCountry) throw new Error("Opt Out countries must be selected EP countries.");
      if (!input.optOutCountryIds.length) throw new Error("Select at least one Opt Out country.");
      request.countryOptMap = Object.fromEntries(
        input.optOutCountryIds.map((countryId) => [String(countryId), true]),
      );
    }
  }
  if (
    input.translationRequired
    && [83, 84, 8283].includes(input.categoryId)
  ) {
    if (!input.targetLangIds.length) throw new Error("Select at least one target language.");
    request.targetLangIds = [...input.targetLangIds];
  }
  return request;
}

export function validatePriceRows(input: {
  categoryId: number;
  requestedCountryIds: number[];
  requestedTargetLangIds: number[];
}, rows: ErpPriceRow[]) {
  if (!rows.length) throw new Error("The pricing service returned no quote rows.");
  const allowed = new Set(input.requestedCountryIds);
  if ([83, 84, 8283].includes(input.categoryId)) allowed.add(1001);
  const seen = new Set<number>();
  const seenTargetLanguages = new Set<number>();
  for (const row of rows) {
    if (!Number.isInteger(row.countryId) || row.countryId <= 0) {
      throw new Error("The pricing service returned an invalid country ID.");
    }
    if (
      [82, 8283].includes(input.categoryId)
      && !allowed.has(row.countryId)
    ) {
      throw new Error(`The pricing service returned unexpected country ${row.countryId}.`);
    }
    if (seen.has(row.countryId)) throw new Error(`The pricing service returned duplicate country ${row.countryId}.`);
    seen.add(row.countryId);
    for (const [label, amount] of [
      ["officialFee", row.officialFee],
      ["serviceFee", row.serviceFee],
    ] as const) {
      if (!Number.isFinite(amount) || amount < 0) {
        throw new Error(`The pricing service returned an invalid ${label} for country ${row.countryId}.`);
      }
    }
    if (
      typeof row.translationFees !== "object"
      || row.translationFees === null
      || Array.isArray(row.translationFees)
    ) {
      throw new Error(`The pricing service returned invalid translationFees for country ${row.countryId}.`);
    }
    for (const [languageIdValue, amount] of Object.entries(row.translationFees)) {
      const languageId = Number(languageIdValue);
      if (!Number.isInteger(languageId) || languageId <= 0) {
        throw new Error(`The pricing service returned invalid target language ${languageIdValue}.`);
      }
      if (!Number.isFinite(amount) || amount < 0) {
        throw new Error(`The pricing service returned an invalid translation fee for language ${languageId}.`);
      }
      if (
        input.requestedTargetLangIds.length
        && !input.requestedTargetLangIds.includes(languageId)
      ) {
        throw new Error(`The pricing service returned unexpected target language ${languageId}.`);
      }
      seenTargetLanguages.add(languageId);
    }
  }
  const missing = input.requestedCountryIds.filter((id) => !seen.has(id));
  if (missing.length) throw new Error(`The quote is missing countries: ${missing.join(", ")}.`);
  if (input.categoryId === 8283 && !seen.has(1001)) {
    throw new Error("The quote is missing the Unitary Patent Europe row.");
  }
  const missingLanguages = input.requestedTargetLangIds.filter(
    (id) => !seenTargetLanguages.has(id),
  );
  if (missingLanguages.length) {
    throw new Error(`The quote is missing target languages: ${missingLanguages.join(", ")}.`);
  }
  return rows;
}

export function priceTotal(rows: ErpPriceRow[]) {
  return roundMoney(rows.reduce(
    (sum, row) => sum + row.officialFee + row.serviceFee
      + Object.values(row.translationFees).reduce((feeSum, fee) => feeSum + fee, 0),
    0,
  ));
}

export function normalizeLogin(value: string) {
  return value.trim().toLocaleLowerCase("en-US");
}

export function stableAuthUserId(clientId: number) {
  const hex = createHash("sha256").update(`eci-erp:${clientId}`).digest("hex").slice(0, 32).split("");
  hex[12] = "5";
  hex[16] = ((Number.parseInt(hex[16], 16) & 3) | 8).toString(16);
  return `${hex.slice(0, 8).join("")}-${hex.slice(8, 12).join("")}-${hex.slice(12, 16).join("")}-${hex.slice(16, 20).join("")}-${hex.slice(20).join("")}`;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
