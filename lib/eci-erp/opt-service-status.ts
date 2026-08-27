export type OptServiceStatus = "Opt Out" | "Opt In";

export function optServiceStatusForCountry(
  serviceItem: string | undefined,
  countryId: number,
  optOutCountryIds: readonly number[] = [],
): OptServiceStatus | null {
  if (serviceItem === "traditional_validation_opt_out") {
    return optOutCountryIds.includes(countryId) ? "Opt Out" : null;
  }
  if (serviceItem === "opt_out_only") return "Opt Out";
  if (serviceItem === "opt_in_only") return "Opt In";
  return null;
}
