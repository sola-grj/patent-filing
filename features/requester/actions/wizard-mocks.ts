import type { WizardPatentCandidate, WizardPatentFile } from "@/features/requester/wizard-types";

export function mockPatentCandidates(query: string): WizardPatentCandidate[] {
  const normalizedQuery = query.trim().toUpperCase();
  const candidates = patentCatalog();
  const exactMatches = candidates.filter((candidate) =>
    matchesPatentField(candidate, normalizedQuery, true),
  );

  if (exactMatches.length > 0) {
    return exactMatches;
  }

  const fuzzyMatches = candidates.filter((candidate) =>
    matchesPatentField(candidate, normalizedQuery, false),
  );

  if (fuzzyMatches.length > 0) {
    return fuzzyMatches;
  }

  return candidates;
}

function patentCatalog(): WizardPatentCandidate[] {
  return [
    buildPatentCandidate({
      id: "candidate-1",
      patentNumber: "EP1234567",
      title: "System and method for adaptive patent document processing",
      jurisdiction: "EP",
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
      downloadableFiles: mockPatentFiles("EP1234567", [
        ["original-document", "Original document", "pdf", 15000, 44, 18, 8],
      ]),
    }),
    buildPatentCandidate({
      id: "candidate-2",
      patentNumber: "EP1234568",
      title: "Terminology alignment engine for multilingual patent drafting",
      jurisdiction: "EP",
      applicationNo: "EP20231234568",
      publicationNo: "EP4567890A1",
      applicants: ["Nordic Claim Systems", "Inventive Drafting Labs"],
      inventors: ["Sofia Lindberg", "Jonas Keller"],
      description:
        "A terminology engine that detects claim inconsistencies, aligns translation memory assets, and produces review-ready multilingual patent drafts.",
      filingDate: "2023-06-08",
      publicationDate: "2025-01-17",
      legalStatus: "Search report issued",
      technicalField: "language technology",
      downloadableFiles: mockPatentFiles("EP1234568", [
        ["application-body", "Application body", "pdf", 12800, 39, 20, 6],
        ["sequence-listing", "Sequence listing", "xml", 2600, 7, 0, 0],
      ]),
    }),
    buildPatentCandidate({
      id: "candidate-3",
      patentNumber: "PCT/EP2021/022481",
      title: "Workflow routing for patent translation task orchestration",
      jurisdiction: "WO",
      applicationNo: "PCT/EP2021/022481",
      publicationNo: "WO2026200421",
      applicants: ["EC Innovations GmbH"],
      inventors: ["Marta Novak", "Daniel Kramer"],
      description:
        "A workflow-routing system that assigns source packages, legal instructions, and terminology assets across patent translation production stages.",
      filingDate: "2023-03-11",
      publicationDate: "2024-09-21",
      legalStatus: "International publication completed",
      technicalField: "workflow automation",
      downloadableFiles: mockPatentFiles("PCT-EP2021-022481", [
        ["international-publication", "International publication", "pdf", 16200, 47, 21, 9],
        ["abstract-package", "Abstract package", "docx", 1200, 3, 2, 0],
      ]),
    }),
    buildPatentCandidate({
      id: "candidate-4",
      patentNumber: "US20260199881",
      title: "Visual review console for prosecution-ready patent translations",
      jurisdiction: "US",
      applicationNo: "US18/456,210",
      publicationNo: "US20260199881A1",
      applicants: ["Claimwise Operations Inc."],
      inventors: ["Elena Brooks", "Haruto Sato", "Liam Reeves"],
      description:
        "A visual console that compares source and translated patent segments, flags terminology risk, and prepares prosecution-ready deliverables for jurisdictional filing.",
      filingDate: "2024-02-09",
      publicationDate: "2026-04-30",
      legalStatus: "Published",
      technicalField: "review interfaces",
      downloadableFiles: mockPatentFiles("US20260199881", [
        ["specification", "Specification", "pdf", 14100, 41, 19, 5],
        ["claims-sheet", "Claims sheet", "docx", 3100, 8, 19, 0],
      ]),
    }),
  ];
}

function matchesPatentField(
  candidate: WizardPatentCandidate,
  query: string,
  exact: boolean,
) {
  if (!query) {
    return true;
  }

  const haystacks = [
    candidate.patentNumber,
    candidate.applicationNo,
    candidate.publicationNo,
    candidate.title,
    candidate.applicants.join(" "),
  ].map((value) => value.toUpperCase());

  if (exact) {
    return haystacks.some((value) => value === query);
  }

  return haystacks.some((value) => value.includes(query));
}

function buildPatentCandidate(candidate: WizardPatentCandidate) {
  return candidate;
}

function mockPatentFiles(
  patentNumber: string,
  files: Array<[string, string, string, number, number, number, number]>,
): WizardPatentFile[] {
  return [
    ...files.map(([id, label, fileType, wordCount, pageCount, claimCount, drawingCount]) =>
      mockPatentFile(
        id,
        label,
        fileType,
        patentNumber,
        wordCount,
        pageCount,
        claimCount,
        drawingCount,
      ),
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
