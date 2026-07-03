import type { WizardPatentCandidate, WizardPatentFile } from "@/features/requester/wizard-types";

export function mockPatentCandidates(query: string): WizardPatentCandidate[] {
  const patentNumber = query.toUpperCase() || "US11000000B2";

  return [
    {
      id: "candidate-1",
      patentNumber,
      title: "System and method for adaptive patent document processing",
      jurisdiction: "WO",
      applicationNo: "PCT/EP2021/022481",
      publicationNo: "WO2026200421",
      applicants: ["EC Innovations GmbH", "Example IP Holdings"],
      inventors: ["Maximilian Weber", "Anna Fischer", "Daniel Kramer"],
      description:
        "A document-processing platform that classifies patent content, aligns terminology across source materials, and prepares structured outputs for downstream translation and review workflows.",
      filingDate: "2023-03-11",
      publicationDate: "2024-09-21",
      legalStatus: "Pending examination",
      technicalField: "software and communications",
      downloadableFiles: mockPatentFiles(patentNumber),
    },
  ];
}

function mockPatentFiles(patentNumber: string): WizardPatentFile[] {
  return [
    mockPatentFile(
      "original-document",
      "Original document",
      "pdf",
      patentNumber,
      15000,
      44,
      18,
      8,
    ),
  ];
}

function mockPatentFile(
  id: string,
  label: string,
  fileType: string,
  patentNumber: string,
  wordCount: number,
  pageCount: number,
  claimCount: number,
  drawingCount: number,
): WizardPatentFile {
  return {
    id,
    label,
    fileType,
    language: "en",
    sourceUrl: `mock://${patentNumber}/${id}.${fileType}`,
    pageCount,
    wordCount,
    claimCount,
    drawingCount,
  };
}
