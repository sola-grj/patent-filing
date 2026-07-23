import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { mapPatentLookupResponse } from "@/features/requester/actions/patent-lookup";
import { PatentDetailStep } from "@/features/requester/components/patent-detail-step";
import type { WizardPatentCandidate } from "@/features/requester/wizard-types";
import type { ReactNode } from "react";

export type PmRequestPatent = {
  patent_number: string;
  title?: string | null;
  abstract?: string | null;
  jurisdiction?: string | null;
  source?: string | null;
  application_no?: string | null;
  publication_no?: string | null;
  applicants?: string[] | null;
  inventors?: string[] | null;
  filing_date?: string | null;
  publication_date?: string | null;
  language?: string | null;
  first_priority_date?: string | null;
  international_filing_date?: string | null;
  filing_deadline_30_months?: string | null;
  filing_deadline_31_months?: string | null;
  total_pages?: number | null;
  legal_status?: string | null;
  ipc_codes?: string[] | null;
  cpc_codes?: string[] | null;
  abstract_word_count?: number | null;
  description_word_count?: number | null;
  claims_word_count?: number | null;
  claims_count?: number | null;
  drawing_count?: number | null;
  source_snapshot?: Record<string, unknown> | null;
};

export function PmPatentInfo({
  action,
  candidate,
  patent,
}: {
  action?: ReactNode;
  candidate?: WizardPatentCandidate | null;
  patent?: PmRequestPatent | null;
}) {
  const resolvedPatent = patent ? toPatentCandidate(patent) : candidate;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle>Patent Information</CardTitle>
        {action}
      </CardHeader>
      <CardContent>
        {resolvedPatent ? (
          <PatentDetailStep
            patent={resolvedPatent}
            plainBibliographic
            useParentScroll
          />
        ) : (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            No patent information is available for this request.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function toPatentCandidate(patent: PmRequestPatent): WizardPatentCandidate {
  const snapshotCandidate = mapPatentLookupResponse(
    patent.source_snapshot ?? {},
    patent.patent_number,
  );
  const ipcCodes = patent.ipc_codes?.length
    ? patent.ipc_codes
    : snapshotCandidate.ipcCodes;
  const cpcCodes = patent.cpc_codes?.length
    ? patent.cpc_codes
    : snapshotCandidate.cpcCodes;

  return {
    ...snapshotCandidate,
    id: patent.patent_number,
    patentNumber: patent.patent_number,
    title: patent.title || snapshotCandidate.title,
    jurisdiction: patent.jurisdiction || snapshotCandidate.jurisdiction,
    applicationNo: patent.application_no || snapshotCandidate.applicationNo,
    publicationNo: patent.publication_no || snapshotCandidate.publicationNo,
    applicants: patent.applicants?.length
      ? patent.applicants
      : snapshotCandidate.applicants,
    inventors: patent.inventors?.length
      ? patent.inventors
      : snapshotCandidate.inventors,
    description: patent.abstract || snapshotCandidate.description,
    filingDate: patent.filing_date || snapshotCandidate.filingDate,
    publicationDate: patent.publication_date || snapshotCandidate.publicationDate,
    language: patent.language || snapshotCandidate.language,
    firstPriorityDate: patent.first_priority_date || snapshotCandidate.firstPriorityDate,
    internationalFilingDate:
      patent.international_filing_date || snapshotCandidate.internationalFilingDate,
    filingDeadline30Months:
      patent.filing_deadline_30_months || snapshotCandidate.filingDeadline30Months,
    filingDeadline31Months:
      patent.filing_deadline_31_months || snapshotCandidate.filingDeadline31Months,
    totalPages: patent.total_pages || snapshotCandidate.totalPages,
    legalStatus: patent.legal_status || snapshotCandidate.legalStatus,
    technicalField: ipcCodes?.[0] || cpcCodes?.[0] || snapshotCandidate.technicalField,
    ipcCodes,
    cpcCodes,
    abstractWordCount:
      patent.abstract_word_count || snapshotCandidate.abstractWordCount,
    descriptionWordCount:
      patent.description_word_count || snapshotCandidate.descriptionWordCount,
    claimsWordCount: patent.claims_word_count || snapshotCandidate.claimsWordCount,
    claimsCount: patent.claims_count || snapshotCandidate.claimsCount,
    drawingCount: patent.drawing_count || snapshotCandidate.drawingCount,
    source: patent.source || snapshotCandidate.source,
    sourceSnapshot: patent.source_snapshot ?? snapshotCandidate.sourceSnapshot,
  };
}
