import { createHash } from "node:crypto";

import type { ErpPriceRow } from "./types";

type ServiceConfig = {
  channelCode: string;
  serviceTypes: string[];
  epvType?: string;
};

export function categoryForConfig(config: ServiceConfig): number | null {
  if (config.channelCode === "ep") {
    if (config.epvType === "traditional_validation") return 82;
    if (config.epvType === "unitary_effect") return 83;
    return null;
  }
  if (config.serviceTypes.includes("annuity")) return 81;
  if (config.serviceTypes.includes("filing")) return 80;
  return null;
}

export function quoteAvailabilityError(config: ServiceConfig) {
  if (config.serviceTypes.includes("european_patent_grant_registration")) {
    return "Online quote is not available for this service.";
  }
  if (config.epvType === "traditional_validation") {
    return "Online quote is not available until Opt Type pricing is mapped in ECI ERP.";
  }
  return categoryForConfig(config) ? null : "Online quote is not available for this service.";
}

export function validatePriceRows(requestedCountryIds: number[], rows: ErpPriceRow[]) {
  const requested = new Set(requestedCountryIds);
  const seen = new Set<number>();
  for (const row of rows) {
    if (!requested.has(row.countryId)) throw new Error(`ECI ERP returned unexpected country ${row.countryId}.`);
    if (seen.has(row.countryId)) throw new Error(`ECI ERP returned duplicate country ${row.countryId}.`);
    seen.add(row.countryId);
    for (const [label, amount] of [
      ["officialFee", row.officialFee],
      ["serviceFee", row.serviceFee],
      ["translationFee", row.translationFee],
    ] as const) {
      if (!Number.isFinite(amount) || amount < 0) {
        throw new Error(`ECI ERP returned an invalid ${label} for country ${row.countryId}.`);
      }
    }
  }
  const missing = requestedCountryIds.filter((id) => !seen.has(id));
  if (missing.length) throw new Error(`ECI ERP quote is missing countries: ${missing.join(", ")}.`);
  return rows;
}

export function priceTotal(rows: ErpPriceRow[]) {
  return roundMoney(rows.reduce(
    (sum, row) => sum + row.officialFee + row.serviceFee + row.translationFee,
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
