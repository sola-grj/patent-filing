export const requestPathLabels: Record<string, string> = {
  ep: "EP",
  pct: "Filing-PCT",
  paris_convention: "FIling-Pairs Convention",
};

export const serviceTypeSelections = [
  {
    value: "ep_granting",
    label: "EP Granting",
    channelCode: "ep",
    serviceTypes: ["european_patent_grant_registration"],
    epvType: "",
    epServiceType: "ep_granting",
  },
  {
    value: "ep_validation",
    label: "Traditional Validation",
    channelCode: "ep",
    serviceTypes: ["epv"],
    epvType: "traditional_validation",
    epServiceType: "traditional_validation",
  },
  {
    value: "unitary_patent",
    label: "Unitary Patent",
    channelCode: "ep",
    serviceTypes: ["epv"],
    epvType: "unitary_effect",
    epServiceType: "unitary_patent",
  },
  {
    value: "traditional_validation_unitary_patent",
    label: "Traditional Validation + Unitary Patent",
    channelCode: "ep",
    serviceTypes: ["epv"],
    epvType: "traditional_validation",
    epServiceType: "traditional_validation_unitary_patent",
  },
  {
    value: "pct_national_phase",
    label: "PCT National Phase Entry",
    channelCode: "pct",
    serviceTypes: ["filing"],
    epvType: "",
    epServiceType: "",
  },
  {
    value: "pct_national_phase_translation",
    label: "PCT National Phase Entry + Translation",
    channelCode: "pct",
    serviceTypes: ["filing", "translation"],
    epvType: "",
    epServiceType: "",
  },
  {
    value: "paris_direct_filing",
    label: "Direct Filing under Paris Convention",
    channelCode: "paris_convention",
    serviceTypes: ["filing"],
    epvType: "",
    epServiceType: "",
  },
  {
    value: "paris_direct_filing_translation",
    label: "Direct Filing under Paris Convention + Translation",
    channelCode: "paris_convention",
    serviceTypes: ["filing", "translation"],
    epvType: "",
    epServiceType: "",
  },
] as const;

export type ServiceTypeSelection = (typeof serviceTypeSelections)[number];
export type ServiceTypeSelectionValue = ServiceTypeSelection["value"];

export function getServiceTypeSelections(channelCode: string) {
  return serviceTypeSelections.filter((option) =>
    option.channelCode === channelCode
  );
}

export function getServiceTypeSelection(value: ServiceTypeSelectionValue) {
  return serviceTypeSelections.find((option) => option.value === value);
}

export function getDefaultServiceTypeSelection(
  channelCode: string,
  serviceTypes: string[],
  epvType: string | undefined,
  epServiceType: string | undefined,
  isSelectable: (option: ServiceTypeSelection) => boolean = () => true,
) {
  if (resolveServiceTypeSelection(
    channelCode,
    serviceTypes,
    epvType,
    epServiceType,
  )) {
    return undefined;
  }

  const selectableOptions = getServiceTypeSelections(channelCode)
    .filter(isSelectable);
  return selectableOptions.length === 1 ? selectableOptions[0] : undefined;
}

export function resolveServiceTypeSelection(
  channelCode: string,
  serviceTypes: string[],
  epvType?: string,
  epServiceType?: string,
) {
  const normalizedTypes = normalizeValues(
    channelCode === "ep"
      ? serviceTypes.filter((value) => value !== "translation")
      : serviceTypes,
  );
  return getServiceTypeSelections(channelCode).find((option) =>
    normalizeValues(option.serviceTypes) === normalizedTypes
    && option.epvType === (epvType ?? "")
    && (
      channelCode !== "ep"
      || !epServiceType
      || option.epServiceType === epServiceType
    )
  );
}

export function normalizeServiceTypeConfig(
  channelCode: string,
  serviceTypes: string[],
  epvType?: string,
  epServiceType?: string,
): { serviceTypes: string[]; epvType: string; epServiceType: string } {
  const resolved = resolveServiceTypeSelection(
    channelCode,
    serviceTypes,
    epvType,
    epServiceType,
  )
    ?? resolveLegacyEpvSelection(channelCode, serviceTypes, epvType);

  return resolved
    ? {
        serviceTypes: [...resolved.serviceTypes],
        epvType: resolved.epvType,
        epServiceType: resolved.epServiceType,
      }
    : { serviceTypes: [], epvType: "", epServiceType: "" };
}

export function isAllowedServiceTypeConfig(
  channelCode: string,
  serviceTypes: string[],
  epvType?: string,
  epServiceType?: string,
) {
  return Boolean(resolveServiceTypeSelection(
    channelCode,
    serviceTypes,
    epvType,
    epServiceType,
  ));
}

export function isTraditionalValidation(epServiceType?: string) {
  return epServiceType === "traditional_validation"
    || epServiceType === "traditional_validation_unitary_patent";
}

export function requiresEpCountries(epServiceType?: string) {
  return isTraditionalValidation(epServiceType);
}

export function usesEpoTargetLanguages(epServiceType?: string) {
  return epServiceType === "ep_granting"
    || epServiceType === "unitary_patent";
}

function resolveLegacyEpvSelection(
  channelCode: string,
  serviceTypes: string[],
  epvType?: string,
) {
  if (channelCode !== "ep" || epvType) return undefined;
  return resolveServiceTypeSelection(
    channelCode,
    serviceTypes,
    "traditional_validation",
  );
}

function normalizeValues(values: readonly string[]) {
  return [...values].sort().join("|");
}
