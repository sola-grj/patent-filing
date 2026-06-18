import type { WizardPatentCandidate, WizardPatentFile } from "@/features/requester/wizard-types";

export function mockPatentCandidates(query: string): WizardPatentCandidate[] {
  return [0, 1, 2].map((index) => {
    const number = `${query.toUpperCase()}-${index + 1}`;
    return {
      id: `candidate-${index + 1}`,
      patentNumber: number,
      title: index === 0 ? "System and method for adaptive patent document processing" : `Patent family match ${index + 1}`,
      jurisdiction: index === 2 ? "EP" : "WO",
      applicationNo: `PCT/EP202${index}/0${index + 1}2481`,
      publicationNo: `WO2026${index + 1}00421`,
      applicants: ["EC Innovations GmbH", "Example IP Holdings"],
      abstract: "A representative patent record used for requester workflow validation. Replace with real patent API data.",
      filingDate: `202${index + 2}-03-1${index}`,
      publicationDate: `202${index + 3}-09-2${index}`,
      legalStatus: index === 1 ? "Pending examination" : "Published",
      technicalField: index === 2 ? "medical devices" : "software and communications",
      downloadableFiles: mockPatentFiles(number, index),
    };
  });
}

function mockPatentFiles(patentNumber: string, offset: number): WizardPatentFile[] {
  const base = 10200 + offset * 1800;
  return [
    mockPatentFile("published-specification", "Published specification", "pdf", patentNumber, base, 34 + offset),
    mockPatentFile("claims", "Claims", "txt", patentNumber, 2600 + offset * 400, 8 + offset),
    mockPatentFile("drawings", "Drawings", "pdf", patentNumber, 850, 12 + offset),
  ];
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
