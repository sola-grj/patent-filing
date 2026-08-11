export const requestPathLabels: Record<string, string> = {
  ep: "EPV",
  pct: "Filing-PCT",
  paris_convention: "FIling-Pairs Convention",
};

export const serviceTypeSelections = [
  {
    value: "translation",
    label: "Translation",
    channelCode: "all",
    serviceTypes: ["translation"],
    epvType: "",
  },
  {
    value: "ep_granting",
    label: "European Patent Granting",
    channelCode: "ep",
    serviceTypes: ["european_patent_grant_registration"],
    epvType: "",
  },
  {
    value: "ep_validation",
    label: "European Patent Validation",
    channelCode: "ep",
    serviceTypes: ["epv"],
    epvType: "traditional_validation",
  },
  {
    value: "unitary_patent",
    label: "Unitary Patent",
    channelCode: "ep",
    serviceTypes: ["epv"],
    epvType: "unitary_effect",
  },
  {
    value: "ep_granting_translation",
    label: "European Patent Granting + Translation",
    channelCode: "ep",
    serviceTypes: ["european_patent_grant_registration", "translation"],
    epvType: "",
  },
  {
    value: "ep_validation_translation",
    label: "European Patent Validation + Translation",
    channelCode: "ep",
    serviceTypes: ["epv", "translation"],
    epvType: "traditional_validation",
  },
  {
    value: "unitary_patent_translation",
    label: "Unitary Patent + Translation",
    channelCode: "ep",
    serviceTypes: ["epv", "translation"],
    epvType: "unitary_effect",
  },
  {
    value: "pct_national_phase",
    label: "PCT National Phase Entry",
    channelCode: "pct",
    serviceTypes: ["filing"],
    epvType: "",
  },
  {
    value: "pct_national_phase_translation",
    label: "PCT National Phase Entry + Translation",
    channelCode: "pct",
    serviceTypes: ["filing", "translation"],
    epvType: "",
  },
  {
    value: "paris_direct_filing",
    label: "Direct Filing under Paris Convention",
    channelCode: "paris_convention",
    serviceTypes: ["filing"],
    epvType: "",
  },
  {
    value: "paris_direct_filing_translation",
    label: "Direct Filing under Paris Convention + Translation",
    channelCode: "paris_convention",
    serviceTypes: ["filing", "translation"],
    epvType: "",
  },
] as const;

export type ServiceTypeSelection = (typeof serviceTypeSelections)[number];
export type ServiceTypeSelectionValue = ServiceTypeSelection["value"];

export function getServiceTypeSelections(channelCode: string) {
  return serviceTypeSelections.filter((option) =>
    option.channelCode === "all" || option.channelCode === channelCode
  );
}

export function getServiceTypeSelection(value: ServiceTypeSelectionValue) {
  return serviceTypeSelections.find((option) => option.value === value);
}

export function resolveServiceTypeSelection(
  channelCode: string,
  serviceTypes: string[],
  epvType?: string,
) {
  const normalizedTypes = normalizeValues(serviceTypes);
  return getServiceTypeSelections(channelCode).find((option) =>
    normalizeValues(option.serviceTypes) === normalizedTypes
    && option.epvType === (epvType ?? "")
  );
}

export function normalizeServiceTypeConfig(
  channelCode: string,
  serviceTypes: string[],
  epvType?: string,
) {
  const resolved = resolveServiceTypeSelection(channelCode, serviceTypes, epvType)
    ?? resolveLegacyEpvSelection(channelCode, serviceTypes, epvType);

  return resolved
    ? { serviceTypes: [...resolved.serviceTypes], epvType: resolved.epvType }
    : { serviceTypes: [], epvType: "" };
}

export function isAllowedServiceTypeConfig(
  channelCode: string,
  serviceTypes: string[],
  epvType?: string,
) {
  return Boolean(resolveServiceTypeSelection(channelCode, serviceTypes, epvType));
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
