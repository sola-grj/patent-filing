import { sourceLanguageOptions } from "@/features/requester/options";
import type {
  WizardDictionaries,
  WizardPayload,
} from "@/features/requester/wizard-types";

export type EstimateRow = {
  jurisdiction: string;
  sourceLanguage: string;
  filingFee: number;
  officialFee: number;
  translationRequirement: string;
  translationWords: number;
  translationUnitPrice: number;
  translationFee: number;
  total: number;
};

export function hasTranslationPricing(payload: WizardPayload) {
  return payload.config.serviceTypes.includes("translation")
    || payload.config.serviceTypes.includes("epv");
}

export function buildEstimateRows(
  payload: WizardPayload,
  dictionaries: WizardDictionaries,
): EstimateRow[] {
  const includeTranslation = hasTranslationPricing(payload);
  const sourceLanguage = labelFor(sourceLanguageOptions, payload.config.sourceLanguage);
  const translationWords = includeTranslation ? resolveTranslationWords(payload) : 0;
  const translationRequirement = resolveTranslationRequirement(payload.config.scopeType);

  return payload.config.jurisdictionCodes.map((jurisdictionCode, index) => {
    const filingFee = 320 + index * 90;
    const officialFee = 180 + index * 120;
    const translationUnitPrice = includeTranslation && translationWords
      ? 0.13 + index * 0.005
      : 0;
    const translationFee = translationWords * translationUnitPrice;

    return {
      jurisdiction: labelFor(dictionaries.jurisdictions, jurisdictionCode),
      sourceLanguage,
      filingFee,
      officialFee,
      translationRequirement,
      translationWords,
      translationUnitPrice,
      translationFee,
      total: filingFee + officialFee + translationFee,
    };
  });
}

export function labelFor(
  options: Array<{ value: string; label: string }>,
  value?: string,
) {
  if (!value) return "-";
  return options.find((option) => option.value === value)?.label ?? value;
}

function resolveTranslationWords(payload: WizardPayload) {
  if (payload.config.scopeType === "no_translation") return 0;
  if (payload.config.scopeType === "claims_only") {
    return payload.analysis?.aggregate.claims_words || 3324;
  }
  return payload.analysis?.aggregate.total_words || 23705;
}

function resolveTranslationRequirement(scopeType: string) {
  if (scopeType === "claims_only") return "Claims only";
  if (scopeType === "no_translation") return "No translation";
  return "Full text";
}
