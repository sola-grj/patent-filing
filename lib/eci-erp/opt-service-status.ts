export type OptServiceStatus = "Opt Out" | "Opt In";

export function optServiceStatusForCountry(
  serviceItem: string | undefined,
): OptServiceStatus | null {
  if (serviceItem === "traditional_validation_opt_out") {
    return "Opt Out";
  }
  if (serviceItem === "opt_out_only") return "Opt Out";
  if (serviceItem === "opt_in_only") return "Opt In";
  return null;
}
