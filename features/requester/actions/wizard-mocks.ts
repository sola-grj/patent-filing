import type { WizardPatentCandidate, WizardPatentFile } from "@/features/requester/wizard-types";

export function mockPatentCandidates(query: string): WizardPatentCandidate[] {
  return Array.from({ length: 10 }, (_, index) => {
    const number = `${query.toUpperCase()}-${index + 1}`;
    const filingYear = 2022 + (index % 4);
    const publicationYear = filingYear + 1;
    const filingDay = String(10 + (index % 10)).padStart(2, "0");
    const publicationDay = String(20 + (index % 8)).padStart(2, "0");

    return {
      id: `candidate-${index + 1}`,
      patentNumber: number,
      title: index === 0 ? "System and method for adaptive patent document processing" : `Patent family match ${index + 1}`,
      jurisdiction: index % 3 === 2 ? "EP" : "WO",
      applicationNo: `PCT/EP202${index}/0${index + 1}2481`,
      publicationNo: `WO2026${index + 1}00421`,
      applicants: ["EC Innovations GmbH", "Example IP Holdings"],
      abstract: "A representative patent record used for requester workflow validation. Replace with real patent API data.",
      filingDate: `${filingYear}-03-${filingDay}`,
      publicationDate: `${publicationYear}-09-${publicationDay}`,
      legalStatus: index % 4 === 1 ? "Pending examination" : "Published",
      technicalField: index % 3 === 2 ? "medical devices" : "software and communications",
      downloadableFiles: mockPatentFiles(number, index),
    };
  });
}

function mockPatentFiles(patentNumber: string, offset: number): WizardPatentFile[] {
  const base = 10200 + offset * 1800;
  const fileTemplates = [
    { id: "published-specification", label: "Published specification", fileType: "pdf", wordCount: base, pageCount: 34 + offset },
    { id: "claims", label: "Claims", fileType: "txt", wordCount: 2600 + offset * 400, pageCount: 8 + offset },
    { id: "drawings", label: "Drawings", fileType: "pdf", wordCount: 850 + offset * 30, pageCount: 12 + offset },
    { id: "abstract", label: "Abstract", fileType: "txt", wordCount: 420 + offset * 20, pageCount: 2 },
    { id: "description", label: "Description", fileType: "docx", wordCount: 7800 + offset * 700, pageCount: 26 + offset },
    { id: "sequence-listing", label: "Sequence listing", fileType: "xml", wordCount: 3300 + offset * 180, pageCount: 14 + offset },
    { id: "search-report", label: "International search report", fileType: "pdf", wordCount: 1200 + offset * 90, pageCount: 6 + offset },
    { id: "written-opinion", label: "Written opinion", fileType: "pdf", wordCount: 2800 + offset * 220, pageCount: 10 + offset },
    { id: "amendments", label: "Applicant amendments", fileType: "docx", wordCount: 1650 + offset * 140, pageCount: 7 + offset },
    { id: "priority-document", label: "Priority document", fileType: "pdf", wordCount: 5400 + offset * 360, pageCount: 18 + offset },
  ];

  return fileTemplates.map((file) =>
    mockPatentFile(file.id, file.label, file.fileType, patentNumber, file.wordCount, file.pageCount),
  );
}

function mockPatentFile(
  id: string,
  label: string,
  fileType: string,
  patentNumber: string,
  wordCount: number,
  pageCount: number,
): WizardPatentFile {
  return {
    id,
    label,
    fileType,
    language: "en",
    sourceUrl: `mock://${patentNumber}/${id}.${fileType}`,
    pageCount,
    wordCount,
    claimCount: label === "Claims" ? 18 : 0,
  };
}
