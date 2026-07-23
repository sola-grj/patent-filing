import type { ReactNode } from "react";

import type {
  WizardPatentCandidate,
  WizardPatentRepresentative,
} from "@/features/requester/wizard-types";
import {
  buildPatentMetadata,
  formatClassificationCode,
  formatDisplayDate,
  summarizeCounts,
  titleCase,
  unique,
} from "./patent-bibliographic-utils";

export function PatentDetailStep({
  patent,
  additionalMetadata = [],
  flushBibliographic = false,
  plainBibliographic = false,
  useParentScroll = false,
}: {
  patent: WizardPatentCandidate;
  additionalMetadata?: Array<{ label: string; value: string }>;
  flushBibliographic?: boolean;
  plainBibliographic?: boolean;
  useParentScroll?: boolean;
}) {
  const metadata = [...buildPatentMetadata(patent), ...additionalMetadata];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b pb-5">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {patent.source === "wipo"
            ? "WIPO PATENTSCOPE"
            : "European Patent Office"}
        </p>
        <h2 className="text-2xl font-semibold tracking-tight">
          {patent.title}
        </h2>
      </div>

      <div
        className={
          useParentScroll
            ? "mt-5 pr-1"
            : "mt-5 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1"
        }
      >
        <div className="space-y-6">
          <section className="space-y-3">
            {!plainBibliographic ? (
              <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Bibliographic data
              </h3>
            ) : null}
            <div
              className={`space-y-6 rounded-xl bg-card text-sm ${
                flushBibliographic
                  ? ""
                  : `p-5 ${plainBibliographic ? "" : "border"}`
              }`}
            >
              <div className="grid content-start gap-x-10 gap-y-6 rounded-lg bg-muted/20 md:grid-cols-2">
                {metadata.map((field) => (
                  <Info
                    key={field.label}
                    label={field.label}
                    value={String(field.value)}
                  />
                ))}
                <NameList label="Applicants" values={patent.applicants} />
                <RepresentativeList
                  label={
                    patent.source === "wipo" ? "Agents" : "Representatives"
                  }
                  values={patent.agents ?? []}
                />
                {patent.totalPages ? (
                  <Info
                    label="Total Pages"
                    value={patent.totalPages.toLocaleString()}
                  />
                ) : null}
              </div>

              <ClassificationGroup label="IPC" values={patent.ipcCodes ?? []} />
              <ClassificationGroup label="CPC" values={patent.cpcCodes ?? []} />

              {patent.inventors.length ? (
                <div className="border-t pt-5">
                  <NameList label="Inventors" values={patent.inventors} />
                </div>
              ) : null}

              <PriorityClaims patent={patent} />
              <DesignatedStates patent={patent} />
              <RelatedDocuments patent={patent} />

              {patent.description ? (
                <div className="border-t pt-5">
                  <FieldLabel>Abstract</FieldLabel>
                  <p className="mt-2 max-w-5xl leading-6 text-foreground/90">
                    {patent.description}
                  </p>
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function ClassificationGroup({
  label,
  values,
}: {
  label: string;
  values: string[];
}) {
  if (!values.length) return null;
  const distinctValues = unique(values.map(formatClassificationCode));
  const visibleValues = distinctValues.slice(0, 8);
  const hiddenValues = distinctValues.slice(8);

  return (
    <div className="border-t pt-5">
      <FieldLabel>{label}</FieldLabel>
      <div className="mt-2 flex flex-wrap gap-2">
        {visibleValues.map((value) => (
          <CodePill key={value}>{value}</CodePill>
        ))}
      </div>
      {hiddenValues.length ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
            View {hiddenValues.length} more classification
            {hiddenValues.length === 1 ? "" : "s"}
          </summary>
          <div className="mt-3 flex flex-wrap gap-2">
            {hiddenValues.map((value) => (
              <CodePill key={value}>{value}</CodePill>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function NameList({ label, values }: { label: string; values: string[] }) {
  if (!values.length) return null;
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div className="mt-2 space-y-1.5 leading-5">
        {unique(values).map((value) => (
          <p key={value}>{value}</p>
        ))}
      </div>
    </div>
  );
}

function RepresentativeList({
  label,
  values,
}: {
  label: string;
  values: WizardPatentRepresentative[];
}) {
  if (!values.length) return null;
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div className="mt-2 space-y-3 leading-5">
        {values.map((value, index) => (
          <div key={`${value.name}-${index}`}>
            {value.name ? <p className="font-medium">{value.name}</p> : null}
            {value.organization ? <p>{value.organization}</p> : null}
            {value.address ? (
              <p className="text-muted-foreground">{value.address}</p>
            ) : null}
            {value.country ? (
              <p className="text-muted-foreground">{value.country}</p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function PriorityClaims({ patent }: { patent: WizardPatentCandidate }) {
  if (!patent.priorities?.length) return null;
  return (
    <div className="border-t pt-5">
      <FieldLabel>Priority Claims</FieldLabel>
      <div className="mt-2 flex flex-wrap gap-2">
        {patent.priorities.map((priority, index) => (
          <CodePill key={`${priority.number}-${priority.date}-${index}`}>
            {[
              priority.country,
              priority.number,
              priority.date,
              titleCase(priority.kind),
            ]
              .map((value, valueIndex) =>
                valueIndex === 2 ? formatDisplayDate(value) : value,
              )
              .filter(Boolean)
              .join(" · ")}
          </CodePill>
        ))}
      </div>
    </div>
  );
}

function DesignatedStates({ patent }: { patent: WizardPatentCandidate }) {
  const states = patent.designatedStates;
  if (
    !states ||
    ![states.regions, states.countries, states.protectionTypes].some(
      (values) => values.length,
    )
  ) {
    return null;
  }
  return (
    <details className="group border-t pt-5">
      <summary className="cursor-pointer list-none">
        <FieldLabel>Designated States</FieldLabel>
        <p className="mt-2 text-muted-foreground">
          {summarizeCounts(
            states.regions.length,
            states.countries.length,
            states.protectionTypes.length,
          )}
        </p>
        <p className="mt-1 text-xs font-medium text-muted-foreground">
          <span className="group-open:hidden">View full list</span>
          <span className="hidden group-open:inline">Collapse</span>
        </p>
      </summary>
      <div className="mt-4 space-y-3">
        <CodeList label="Regional systems" values={states.regions} />
        <CodeList label="Countries" values={states.countries} />
        <CodeList label="Protection types" values={states.protectionTypes} />
      </div>
    </details>
  );
}

function RelatedDocuments({ patent }: { patent: WizardPatentCandidate }) {
  if (!patent.relatedPatentDocuments?.length) return null;
  return (
    <div className="border-t pt-5">
      <FieldLabel>Related Patent Documents</FieldLabel>
      <div className="mt-2 flex flex-wrap gap-2">
        {patent.relatedPatentDocuments.map((value) => (
          <CodePill key={value}>{value}</CodePill>
        ))}
      </div>
    </div>
  );
}

function CodeList({ label, values }: { label: string; values: string[] }) {
  if (!values.length) return null;
  return (
    <div className="grid gap-2 sm:grid-cols-[9rem_1fr]">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex flex-wrap gap-2">
        {values.map((value) => (
          <CodePill key={value}>{value}</CodePill>
        ))}
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <p className="mt-2 leading-5">{value}</p>
    </div>
  );
}

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
      {children}
    </p>
  );
}

function CodePill({ children }: { children: ReactNode }) {
  return (
    <span className="rounded border bg-muted/30 px-2 py-1 font-mono text-xs leading-5">
      {children}
    </span>
  );
}
