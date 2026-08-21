export type PctChapterCode = "chapter_i" | "chapter_ii";

export type DashboardDeadlineItem = {
  id: string;
  requestId: string;
  href: string;
  dueOn: string;
  date: string;
  title: string;
  detail: string;
  service: string;
  overdue: boolean;
  jurisdictionCodes: string[];
};

export type EpoServiceAvailability = {
  available: boolean;
  deadline?: string;
  reason?: string;
};

type EpoAvailabilityPatent = {
  grantPublicationDate?: string | null;
  rule713CommunicationDate?: string | null;
  hasB1Publication?: boolean;
  dataOrigin?: "official" | "cache_fallback";
};

type EpoAvailabilityAnalysis = {
  source_document?: {
    kind_code?: string | null;
    document_kind?: string | null;
  } | null;
};

type DeadlineRequirement = {
  service_types?: string[] | null;
  epv_type_code?: string | null;
  ep_service_type_code?: string | null;
  jurisdiction_codes?: string[] | null;
  pct_chapter_code?: string | null;
};

type DeadlinePatent = {
  patent_number?: string | null;
  application_no?: string | null;
  publication_no?: string | null;
  first_priority_date?: string | null;
  international_filing_date?: string | null;
  grant_publication_date?: string | null;
  rule_71_3_communication_date?: string | null;
};

export type RequestDeadlineSource = {
  id: string;
  request_no?: string | null;
  channel_code?: string | null;
  submitted_at?: string | null;
  workflow_stage?: string | null;
  requester_status?: string | null;
  translation_requirements?: DeadlineRequirement | DeadlineRequirement[] | null;
  request_patents?: DeadlinePatent | DeadlinePatent[] | null;
};

type PctOfficeRule = {
  officeCode: string;
  chapterI: number;
  chapterII: number;
};

export const WIPO_PCT_TIME_LIMITS_SOURCE = {
  url: "https://www.wipo.int/en/web/pct-system/texts/time_limits",
  verifiedOn: "2026-08-11",
} as const;

const EP_ONLY_JURISDICTIONS = [
  "BE", "CY", "FR", "GR", "IE", "LT", "LV", "MC", "ME", "MT", "NL",
  "SI", "SM",
] as const;

const EP_GRANTING_DEADLINE_MONTHS = 4;
const TRADITIONAL_VALIDATION_DEADLINE_MONTHS = 3;
const UNITARY_PATENT_DEADLINE_MONTHS = 1;

const pctOfficeRules: Record<string, PctOfficeRule> = {
  AL: officeRule("AL", 31),
  AT: officeRule("AT", 30),
  BA: officeRule("BA", 34),
  BG: officeRule("BG", 31),
  CH: officeRule("CH", 30),
  CZ: officeRule("CZ", 31),
  DE: officeRule("DE", 31),
  DK: officeRule("DK", 31),
  EE: officeRule("EE", 31),
  ES: officeRule("ES", 30),
  FI: officeRule("FI", 31),
  GB: officeRule("GB", 31),
  GE: officeRule("GE", 31),
  HR: officeRule("HR", 31),
  HU: officeRule("HU", 31),
  IS: officeRule("IS", 31),
  IT: officeRule("IT", 30),
  KH: officeRule("KH", 30),
  LA: officeRule("LA", 30),
  LI: officeRule("CH", 30),
  LU: { officeCode: "LU", chapterI: 20, chapterII: 30 },
  MA: officeRule("MA", 31),
  MD: officeRule("MD", 31),
  MK: officeRule("MK", 31),
  NO: officeRule("NO", 31),
  PL: officeRule("PL", 30),
  PT: officeRule("PT", 30),
  RO: officeRule("RO", 30),
  RS: officeRule("RS", 30),
  SE: officeRule("SE", 31),
  SK: officeRule("SK", 31),
  TN: officeRule("TN", 30),
  TR: officeRule("TR", 30),
};

for (const jurisdiction of EP_ONLY_JURISDICTIONS) {
  pctOfficeRules[jurisdiction] = officeRule("EP", 31);
}

export function buildDashboardDeadlineItems(
  requests: RequestDeadlineSource[],
  today = new Date().toISOString().slice(0, 10),
): DashboardDeadlineItem[] {
  return requests
    .filter(isActiveSubmittedRequest)
    .flatMap((request) => buildRequestDeadlineItems(request, today))
    .filter((item) => !item.overdue)
    .sort((left, right) => {
      return left.dueOn.localeCompare(right.dueOn)
        || left.title.localeCompare(right.title);
    });
}

export function buildRequestDeadlineItems(
  request: RequestDeadlineSource,
  today = new Date().toISOString().slice(0, 10),
): DashboardDeadlineItem[] {
  if (!request.submitted_at) return [];
  return buildRequestDeadlines(request, today).sort((left, right) =>
    left.dueOn.localeCompare(right.dueOn)
      || left.title.localeCompare(right.title));
}

export function getRequestDeadlinePendingMessage(
  request: RequestDeadlineSource,
) {
  if (!request.submitted_at) return null;
  const requirement = first(request.translation_requirements);
  const patent = first(request.request_patents);
  if (!requirement || !patent) return null;
  const services = requirement.service_types ?? [];

  if (
    services.includes("european_patent_grant_registration")
    && !patent.rule_71_3_communication_date
  ) {
    return "Waiting for the official Rule 71(3) communication date.";
  }
  if (services.includes("epv") && !patent.grant_publication_date) {
    return "Waiting for the official mention-of-grant publication date.";
  }
  if (
    services.includes("filing")
    && request.channel_code === "paris_convention"
    && !patent.first_priority_date
  ) {
    return "Waiting for the earliest priority date.";
  }
  if (
    services.includes("filing")
    && request.channel_code === "pct"
    && !patent.first_priority_date
    && !patent.international_filing_date
  ) {
    return "Waiting for the PCT filing or earliest priority date.";
  }
  return null;
}

export function addCalendarMonths(dateValue: string, months: number) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue);
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const source = new Date(Date.UTC(year, monthIndex, day));
  if (
    source.getUTCFullYear() !== year
    || source.getUTCMonth() !== monthIndex
    || source.getUTCDate() !== day
  ) {
    return null;
  }

  const targetMonthStart = new Date(Date.UTC(year, monthIndex + months, 1));
  const targetYear = targetMonthStart.getUTCFullYear();
  const targetMonth = targetMonthStart.getUTCMonth();
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return formatDateOnly(targetYear, targetMonth + 1, Math.min(day, lastDay));
}

export function getEpoServiceAvailability(
  epServiceType: string,
  patent?: EpoAvailabilityPatent | null,
  analysis?: EpoAvailabilityAnalysis | null,
  today = new Date().toISOString().slice(0, 10),
): EpoServiceAvailability {
  if (![
    "ep_granting",
    "traditional_validation",
    "unitary_patent",
    "traditional_validation_unitary_patent",
  ].includes(epServiceType)) {
    return { available: true };
  }
  if (!patent) {
    return unavailable("Search and select an EP patent before choosing this service.");
  }
  if (patent.dataOrigin === "cache_fallback") {
    return unavailable("Current EPO grant status could not be confirmed from the official source.");
  }

  const documentKind = (
    analysis?.source_document?.document_kind
    ?? analysis?.source_document?.kind_code
    ?? ""
  ).toUpperCase();
  const hasB1Publication = patent.hasB1Publication === true
    || Boolean(patent.grantPublicationDate)
    || documentKind === "B1";

  if (epServiceType === "ep_granting") {
    if (hasB1Publication) {
      return unavailable("An EPO B1 grant publication already exists, so EP Granting is no longer available.");
    }
    return availabilityUntil({
      basisDate: patent.rule713CommunicationDate,
      months: EP_GRANTING_DEADLINE_MONTHS,
      today,
      missingReason: "A Rule 71(3) communication is required before EP Granting can be selected.",
      expiredLabel: "EP Granting",
    });
  }

  if (!hasB1Publication || !patent.grantPublicationDate) {
    return unavailable("An EPO B1 grant publication date is required before this service can be selected.");
  }
  const isUnitary = epServiceType === "unitary_patent"
    || epServiceType === "traditional_validation_unitary_patent";
  return availabilityUntil({
    basisDate: patent.grantPublicationDate,
    months: isUnitary
      ? UNITARY_PATENT_DEADLINE_MONTHS
      : TRADITIONAL_VALIDATION_DEADLINE_MONTHS,
    today,
    missingReason: "A valid EPO B1 grant publication date is required.",
    expiredLabel: epServiceType === "traditional_validation"
      ? "Traditional Validation"
      : epServiceType === "unitary_patent"
        ? "Unitary Patent"
        : "Traditional Validation + Unitary Patent",
  });
}

export function resolvePctOfficeRule(jurisdictionCode: string) {
  return pctOfficeRules[jurisdictionCode.toUpperCase()] ?? null;
}

function buildRequestDeadlines(
  request: RequestDeadlineSource,
  today: string,
) {
  const requirement = first(request.translation_requirements);
  const patent = first(request.request_patents);
  if (!requirement || !patent) return [];
  const services = requirement.service_types ?? [];
  const detail = patent.publication_no
    || patent.patent_number
    || patent.application_no
    || request.request_no
    || "Patent request";

  if (services.includes("european_patent_grant_registration")) {
    return singleDeadline(request, {
      basisDate: patent.rule_71_3_communication_date,
      months: EP_GRANTING_DEADLINE_MONTHS,
      today,
      title: "European Patent Granting deadline",
      detail,
      service: "European Patent Granting",
      type: "ep_granting",
    });
  }

  if (services.includes("epv")) {
    if (requirement.ep_service_type_code === "traditional_validation_unitary_patent") {
      return [
        ...singleDeadline(request, {
          basisDate: patent.grant_publication_date,
          months: TRADITIONAL_VALIDATION_DEADLINE_MONTHS,
          today,
          title: "EP validation deadline",
          detail,
          service: "EP Validation",
          type: "ep_validation",
        }),
        ...singleDeadline(request, {
          basisDate: patent.grant_publication_date,
          months: UNITARY_PATENT_DEADLINE_MONTHS,
          today,
          title: "Unitary Patent deadline",
          detail,
          service: "Unitary Patent",
          type: "unitary_patent",
        }),
      ];
    }
    const unitary = requirement.epv_type_code === "unitary_effect";
    return singleDeadline(request, {
      basisDate: patent.grant_publication_date,
      months: unitary
        ? UNITARY_PATENT_DEADLINE_MONTHS
        : TRADITIONAL_VALIDATION_DEADLINE_MONTHS,
      today,
      title: unitary ? "Unitary Patent deadline" : "EP validation deadline",
      detail,
      service: unitary ? "Unitary Patent" : "EP Validation",
      type: unitary ? "unitary_patent" : "ep_validation",
    });
  }

  if (!services.includes("filing")) return [];
  if (request.channel_code === "paris_convention") {
    return singleDeadline(request, {
      basisDate: patent.first_priority_date,
      months: 12,
      today,
      title: "12-month priority deadline",
      detail,
      service: "Paris Convention",
      type: "paris_priority",
    });
  }
  if (request.channel_code !== "pct") return [];

  const basisDate = patent.first_priority_date || patent.international_filing_date;
  if (!basisDate) return [];
  const chapter: PctChapterCode = requirement.pct_chapter_code === "chapter_ii"
    ? "chapter_ii"
    : "chapter_i";
  const grouped = new Map<string, { months: number; jurisdictions: string[] }>();
  for (const jurisdiction of requirement.jurisdiction_codes ?? []) {
    const rule = resolvePctOfficeRule(jurisdiction);
    if (!rule) continue;
    const months = chapter === "chapter_ii" ? rule.chapterII : rule.chapterI;
    const dueOn = addCalendarMonths(basisDate, months);
    if (!dueOn) continue;
    const existing = grouped.get(dueOn) ?? { months, jurisdictions: [] };
    existing.jurisdictions.push(jurisdiction);
    grouped.set(dueOn, existing);
  }

  return [...grouped.entries()].map(([dueOn, group]) => makeDeadlineItem(request, {
    dueOn,
    today,
    title: `PCT ${group.months}-month deadline`,
    detail: `${detail} · ${group.jurisdictions.join(", ")}`,
    service: "National Phase Entry",
    type: `pct_${chapter}`,
    jurisdictionCodes: group.jurisdictions,
  }));
}

function singleDeadline(
  request: RequestDeadlineSource,
  input: {
    basisDate?: string | null;
    months: number;
    today: string;
    title: string;
    detail: string;
    service: string;
    type: string;
  },
) {
  if (!input.basisDate) return [];
  const dueOn = addCalendarMonths(input.basisDate, input.months);
  if (!dueOn) return [];
  return [makeDeadlineItem(request, { ...input, dueOn, jurisdictionCodes: [] })];
}

function availabilityUntil(input: {
  basisDate?: string | null;
  months: number;
  today: string;
  missingReason: string;
  expiredLabel: string;
}): EpoServiceAvailability {
  if (!input.basisDate) return unavailable(input.missingReason);
  const deadline = addCalendarMonths(input.basisDate, input.months);
  if (!deadline || !addCalendarMonths(input.today, 0)) {
    return unavailable(input.missingReason);
  }
  if (deadline < input.today) {
    return unavailable(`${input.expiredLabel} deadline passed on ${deadline}.`, deadline);
  }
  return { available: true, deadline };
}

function unavailable(reason: string, deadline?: string): EpoServiceAvailability {
  return { available: false, reason, ...(deadline ? { deadline } : {}) };
}

function makeDeadlineItem(
  request: RequestDeadlineSource,
  input: {
    dueOn: string;
    today: string;
    title: string;
    detail: string;
    service: string;
    type: string;
    jurisdictionCodes: string[];
  },
): DashboardDeadlineItem {
  return {
    id: `${request.id}:${input.type}:${input.dueOn}`,
    requestId: request.id,
    href: `/requester/requests/${request.id}`,
    dueOn: input.dueOn,
    date: formatDashboardDate(input.dueOn),
    title: input.title,
    detail: input.detail,
    service: input.service,
    overdue: input.dueOn < input.today,
    jurisdictionCodes: input.jurisdictionCodes,
  };
}

function isActiveSubmittedRequest(request: RequestDeadlineSource) {
  return Boolean(request.submitted_at)
    && !["draft", "closed"].includes(request.workflow_stage ?? "")
    && !["completed", "rejected"].includes(request.requester_status ?? "");
}

function first<T>(value?: T | T[] | null) {
  return Array.isArray(value) ? value[0] : value ?? undefined;
}

function officeRule(officeCode: string, months: number): PctOfficeRule {
  return { officeCode, chapterI: months, chapterII: months };
}

function formatDateOnly(year: number, month: number, day: number) {
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

function formatDashboardDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}
