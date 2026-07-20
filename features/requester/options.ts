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

export const jurisdictionOptions = [
  { value: "BE", label: "Belgium" },
  { value: "DE", label: "Germany" },
  { value: "FR", label: "France" },
  { value: "LU", label: "Luxembourg" },
  { value: "NL", label: "Netherlands" },
  { value: "CH", label: "Switzerland" },
  { value: "GB", label: "United Kingdom" },
  { value: "SE", label: "Sweden" },
  { value: "IT", label: "Italy" },
  { value: "AT", label: "Austria" },
  { value: "LI", label: "Liechtenstein" },
  { value: "GR", label: "Greece" },
  { value: "ES", label: "Spain" },
  { value: "DK", label: "Denmark" },
  { value: "MC", label: "Monaco" },
  { value: "PT", label: "Portugal" },
  { value: "IE", label: "Ireland" },
  { value: "FI", label: "Finland" },
  { value: "CY", label: "Cyprus" },
  { value: "TR", label: "Türkiye" },
  { value: "BG", label: "Bulgaria" },
  { value: "CZ", label: "Czech Republic" },
  { value: "EE", label: "Estonia" },
  { value: "SK", label: "Slovakia" },
  { value: "SI", label: "Slovenia" },
  { value: "HU", label: "Hungary" },
  { value: "RO", label: "Romania" },
  { value: "PL", label: "Poland" },
  { value: "IS", label: "Iceland" },
  { value: "LT", label: "Lithuania" },
  { value: "LV", label: "Latvia" },
  { value: "MT", label: "Malta" },
  { value: "HR", label: "Croatia" },
  { value: "NO", label: "Norway" },
  { value: "MK", label: "North Macedonia" },
  { value: "SM", label: "San Marino" },
  { value: "AL", label: "Albania" },
  { value: "RS", label: "Serbia" },
  { value: "ME", label: "Montenegro" },
  { value: "MD", label: "Republic of Moldova" },
  { value: "BA", label: "Bosnia and Herzegovina" },
  { value: "MA", label: "Morocco" },
  { value: "TN", label: "Tunisia" },
  { value: "KH", label: "Cambodia" },
  { value: "GE", label: "Georgia" },
  { value: "LA", label: "Lao People's Democratic Republic" },
];

export const scopeOptions = [
  { value: "full_text", label: "Full Text" },
  { value: "no_translation", label: "No Translation Required" },
  { value: "claims_only", label: "Claims" },
];

export const purposeOptions = [
  { value: "european_validation", label: "EP validation" },
  { value: "pct_national_phase", label: "PCT" },
  { value: "paris_convention", label: "Paris convention" },
];

export const channelOptions = [
  { value: "ep", label: "EP" },
  { value: "pct", label: "PCT" },
  { value: "paris_convention", label: "Paris Convention" },
  { value: "upload_files", label: "Upload Files" },
];

export const serviceTypeOptions = [
  { value: "translation", label: "Translation" },
  { value: "filing", label: "Filing" },
  {
    value: "european_patent_grant_registration",
    label: "European Patent Grant Registration",
  },
  { value: "epv", label: "EPV" },
];

export const entityTypeOptions = [
  { value: "large_entity", label: "Large" },
  { value: "small_entity", label: "Small" },
  { value: "micro_entity", label: "Micro" },
];

export const filingTypeOptions = [
  { value: "submission", label: "Submission" },
  { value: "annuity", label: "Annuity" },
];

export const filingApplicationTypeOptions = [
  { value: "invention", label: "Invention" },
  { value: "utility_model", label: "Utility Model" },
  { value: "design", label: "Industrial Design" },
  { value: "trademark", label: "Trademark" },
];

export const epvTypeOptions = [
  { value: "traditional_validation", label: "Traditional Validation" },
  { value: "unitary_effect", label: "Unitary Effect" },
];

export const qualityOptions = [
  { value: "machine_pretranslation", label: "Machine Translation" },
  { value: "patent_translator", label: "Human Translation" },
];

export const rejectReasonOptions = [
  "Price is too high",
  "Delivery timeline does not fit",
  "Translation scope needs adjustment",
  "Request is no longer needed",
];

export const allowedUploadExtensions = [".pdf", ".doc", ".docx", ".xml", ".txt"];
