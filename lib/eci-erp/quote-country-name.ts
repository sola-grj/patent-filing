export function quoteCountryName(
  countryName: string,
  serviceType?: string | null,
) {
  return serviceType === "unitary_patent"
    ? "Unitary Patent"
    : countryName;
}
