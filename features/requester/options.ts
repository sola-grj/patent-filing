export const requestStatusOptions = [
  { value: "all", label: "All lifecycle states" },
  { value: "responding", label: "Responding" },
  { value: "negotiation", label: "Negotiating" },
  { value: "in_progress", label: "In progress" },
  { value: "rejected", label: "Rejected" },
  { value: "completed", label: "Completed" },
];

export const sourceLanguageOptions = [
  { value: "zh-CN", label: "Chinese" },
  { value: "en", label: "English" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
  { value: "de", label: "German" },
  { value: "fr", label: "French" },
];

export const targetLanguageOptions = [
  { value: "en", label: "English" },
  { value: "zh-CN", label: "Chinese" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
  { value: "de", label: "German" },
  { value: "fr", label: "French" },
];

export const scopeOptions = [
  { value: "full_text", label: "Full text" },
  { value: "claims_only", label: "Claims only" },
  { value: "abstract_only", label: "Abstract only" },
  { value: "description_and_claims", label: "Description + claims" },
  { value: "description_claims_abstract", label: "Description + claims + abstract" },
  { value: "drawing_text", label: "Drawing text" },
];

export const purposeOptions = [
  { value: "pct_national_phase", label: "PCT" },
  { value: "paris_convention", label: "Paris convention" },
  { value: "european_validation", label: "EP validation" },
];

export const qualityOptions = [
  { value: "machine_pretranslation", label: "Machine pre-translation" },
  { value: "patent_translator", label: "Patent translator" },
  { value: "patent_translator_review", label: "Patent translator + review" },
  { value: "patent_translator_native_review", label: "Patent translator + native review" },
  { value: "local_agent_review", label: "Local agent review" },
];

export const rejectReasonOptions = [
  "Price is too high",
  "Delivery timeline does not fit",
  "Translation scope needs adjustment",
  "Request is no longer needed",
];

export const allowedUploadExtensions = [".pdf", ".doc", ".docx", ".xml", ".txt"];
