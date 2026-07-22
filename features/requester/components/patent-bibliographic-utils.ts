import type { WizardPatentCandidate } from "@/features/requester/wizard-types";

type BibliographicField = {
  label: string;
  value?: string | number;
};

export function buildPatentMetadata(
  patent: WizardPatentCandidate,
): BibliographicField[] {
  const fields: BibliographicField[] = patent.source === "wipo"
    ? [
        { label: "Publication Number", value: patent.publicationNo },
        { label: "Publication Date", value: formatDisplayDate(patent.publicationDate) },
        { label: "International Application No.", value: patent.applicationNo },
        { label: "International Filing Date", value: formatDisplayDate(patent.internationalFilingDate) },
        { label: "Publication Language", value: patent.publicationLanguage || patent.language },
        { label: "Filing Language", value: patent.filingLanguage },
        { label: "First Priority Date", value: formatDisplayDate(patent.firstPriorityDate) },
      ]
    : [
        { label: "Application No.", value: patent.applicationNo },
        { label: "Filing Date", value: formatDisplayDate(patent.filingDate) },
        { label: "Publication No.", value: patent.publicationNo },
        { label: "Publication Date", value: formatDisplayDate(patent.publicationDate) },
        { label: "First Priority Date", value: formatDisplayDate(patent.firstPriorityDate) },
        { label: "International Filing Date", value: formatDisplayDate(patent.internationalFilingDate) },
        { label: "Filing Language", value: patent.filingLanguage },
        { label: "Publication Language", value: patent.publicationLanguage || patent.language },
      ];

  return fields.filter((field) => hasValue(field.value));
}

export function formatDisplayDate(value?: string) {
  if (!value) return "";
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : value;
}

export function formatClassificationCode(value: string) {
  const wipoIpc = value.match(
    /^(\d{4})(\d{2})\d{2}\s+[A-Z]\s+([A-H])\s+(\d{2})\s+([A-Z])\s+(\d+)\s+(\d+)\b/,
  );
  if (wipoIpc) {
    const [, year, month, section, classNo, subclass, mainGroup, subgroup] = wipoIpc;
    return `${section}${classNo}${subclass} ${mainGroup}/${subgroup} ${year}.${Number(month)}`;
  }

  const spacedCode = value.match(/^([A-H])\s+(\d{2})\s+([A-Z])\s+(\d+)\s+(\d+)\b/);
  if (spacedCode) {
    const [, section, classNo, subclass, mainGroup, subgroup] = spacedCode;
    return `${section}${classNo}${subclass} ${mainGroup}/${subgroup}`;
  }

  const compactCode = value.match(/^([A-H]\d{2}[A-Z])\s+(\d+)\s*\/\s*(\d+)\b/);
  return compactCode
    ? `${compactCode[1]} ${compactCode[2]}/${compactCode[3]}`
    : value;
}

export function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

export function titleCase(value: string) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1).toLowerCase() : "";
}

export function summarizeCounts(
  regions: number,
  countries: number,
  protectionTypes: number,
) {
  return [
    regions ? `${regions} regional system${regions === 1 ? "" : "s"}` : "",
    countries ? `${countries} countr${countries === 1 ? "y" : "ies"}` : "",
    protectionTypes ? `${protectionTypes} protection type${protectionTypes === 1 ? "" : "s"}` : "",
  ].filter(Boolean).join(" · ");
}

function hasValue(value: BibliographicField["value"]) {
  return value !== undefined && value !== null && value !== "" && value !== 0;
}
