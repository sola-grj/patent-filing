import { ChevronDown } from "lucide-react";

import type { WizardPatentCandidate } from "@/features/requester/wizard-types";
import { formatDisplayDate } from "./patent-bibliographic-utils";

export function PatentBasicInfo({
  patent,
  heading = "Patent Information",
  additionalFields = [],
}: {
  patent: WizardPatentCandidate;
  heading?: string;
  additionalFields?: Array<{ label: string; value?: string }>;
}) {
  const fields = [
    { label: "Title", value: patent.title },
    {
      label: patent.source === "wipo"
        ? "International Application No."
        : "Application No.",
      value: patent.applicationNo,
    },
    {
      label: patent.source === "wipo"
        ? "International Filing Date"
        : "Filing Date",
      value: formatDisplayDate(
        patent.source === "wipo"
          ? patent.internationalFilingDate || patent.filingDate
          : patent.filingDate,
      ),
    },
    { label: "Publication No.", value: patent.publicationNo },
    { label: "Publication Date", value: formatDisplayDate(patent.publicationDate) },
    { label: "First Priority Date", value: formatDisplayDate(patent.firstPriorityDate) },
    {
      label: "Publication Language",
      value: patent.publicationLanguage || patent.language,
    },
    ...additionalFields,
  ].filter((field): field is { label: string; value: string } =>
    typeof field.value === "string" && field.value.length > 0
  );

  return (
    <details open className="group rounded-2xl border bg-card">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5">
        <p className="text-sm font-bold uppercase tracking-[0.2em]">
          {heading}
        </p>
        <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>

      <div className="border-t px-6 py-5">
        <div className="grid gap-x-10 gap-y-5 md:grid-cols-2">
          {fields.map((field) => (
            <BibliographicField
              key={field.label}
              label={field.label}
              value={field.value}
            />
          ))}
          {patent.applicants.length ? (
            <div className="md:col-span-2">
              <FieldLabel>Applicants</FieldLabel>
              <div className="mt-2 space-y-1.5 text-sm leading-5">
                {[...new Set(patent.applicants)].map((applicant) => (
                  <p key={applicant}>{applicant}</p>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </details>
  );
}

function BibliographicField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <p className="mt-2 text-sm leading-5">{value}</p>
    </div>
  );
}

function FieldLabel({ children }: { children: string }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
      {children}
    </p>
  );
}
