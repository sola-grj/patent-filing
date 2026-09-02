import type { FilingSignatureFile, SignatureUpload } from "./types";

const TRADITIONAL_SERVICES = new Set([
  "traditional_validation",
  "traditional_validation_unitary_patent",
]);

export type SignatureCountryScope = {
  countryScoped: boolean;
  countryIds: number[];
};

export function signatureCountryScope(requirement?: {
  ep_service_type_code?: string | null;
  ep_country_ids?: number[] | null;
} | null): SignatureCountryScope {
  const countryScoped = TRADITIONAL_SERVICES.has(
    requirement?.ep_service_type_code ?? "",
  );
  return {
    countryScoped,
    countryIds: countryScoped
      ? [...new Set(requirement?.ep_country_ids ?? [])]
      : [],
  };
}

export function validateSignatureUploadCountries(
  uploads: readonly SignatureUpload[],
  scope: SignatureCountryScope,
) {
  const allowed = new Set(scope.countryIds);
  for (const upload of uploads) {
    if (scope.countryScoped && !allowed.has(upload.epCountryId ?? -1)) {
      throw new Error("Choose a valid EP country for every signature file.");
    }
    if (!scope.countryScoped && upload.epCountryId !== null) {
      throw new Error("This signature package does not accept country-specific files.");
    }
  }
}

export function requiredReturnCountryIds(files: readonly FilingSignatureFile[]) {
  return [...new Set(
    files
      .filter((file) => file.direction === "pm_to_requester")
      .map((file) => file.ep_country_id)
      .filter((countryId): countryId is number => Number.isInteger(countryId)),
  )];
}

export function missingReturnCountryIds(
  sourceFiles: readonly FilingSignatureFile[],
  returnedFiles: readonly FilingSignatureFile[],
) {
  const returned = new Set(
    returnedFiles
      .filter((file) => file.direction === "requester_to_pm")
      .map((file) => file.ep_country_id),
  );
  return requiredReturnCountryIds(sourceFiles).filter(
    (countryId) => !returned.has(countryId),
  );
}
