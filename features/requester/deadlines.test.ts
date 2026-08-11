import assert from "node:assert/strict";
import test from "node:test";

import {
  addCalendarMonths,
  buildDashboardDeadlineItems,
  buildRequestDeadlineItems,
  getRequestDeadlinePendingMessage,
  resolvePctOfficeRule,
  type RequestDeadlineSource,
} from "./deadlines.ts";

const activeRequest = {
  id: "request-1",
  request_no: "REQ-1",
  submitted_at: "2026-01-01T00:00:00Z",
  workflow_stage: "quoted",
  requester_status: "responding",
} satisfies RequestDeadlineSource;

test("adds calendar months and clamps to the target month end", () => {
  assert.equal(addCalendarMonths("2024-01-31", 1), "2024-02-29");
  assert.equal(addCalendarMonths("2025-01-31", 1), "2025-02-28");
  assert.equal(addCalendarMonths("2025-02-28", 12), "2026-02-28");
  assert.equal(addCalendarMonths("invalid", 1), null);
});

test("builds EP granting, validation and unitary deadlines from separate dates", () => {
  const requests: RequestDeadlineSource[] = [
    epRequest("grant", ["european_patent_grant_registration"], "", {
      rule_71_3_communication_date: "2026-01-31",
    }),
    epRequest("validation", ["epv", "translation"], "traditional_validation", {
      grant_publication_date: "2026-02-28",
    }),
    epRequest("unitary", ["epv"], "unitary_effect", {
      grant_publication_date: "2026-03-31",
    }),
  ];

  const items = buildDashboardDeadlineItems(requests, "2026-01-01");

  assert.deepEqual(items.map((item) => [item.title, item.dueOn]), [
    ["EP validation deadline", "2026-05-28"],
    ["European Patent Granting deadline", "2026-05-31"],
    ["Unitary Patent deadline", "2026-04-30"],
  ].sort((left, right) => left[1].localeCompare(right[1])));
});

test("builds Paris deadline but excludes translation-only and missing priority", () => {
  const items = buildDashboardDeadlineItems([
    filingRequest("paris", "paris_convention", ["filing", "translation"], {
      first_priority_date: "2025-08-31",
    }),
    filingRequest("missing", "paris_convention", ["filing"], {}),
    epRequest("translation", ["translation"], "", {
      grant_publication_date: "2026-01-01",
    }),
  ], "2026-01-01");

  assert.equal(items.length, 1);
  assert.equal(items[0].dueOn, "2026-08-31");
  assert.equal(items[0].service, "Paris Convention");
});

test("uses international filing date and groups PCT jurisdictions by due date", () => {
  const request = filingRequest("pct", "pct", ["filing"], {
    international_filing_date: "2024-01-31",
  });
  request.translation_requirements = [{
    service_types: ["filing"],
    epv_type_code: null,
    jurisdiction_codes: ["LU", "DE", "BE"],
    pct_chapter_code: "chapter_i",
  }];

  const items = buildDashboardDeadlineItems([request], "2025-01-01");

  assert.deepEqual(items.map((item) => ({
    dueOn: item.dueOn,
    jurisdictions: item.jurisdictionCodes,
  })), [
    { dueOn: "2025-09-30", jurisdictions: ["LU"] },
    { dueOn: "2026-08-31", jurisdictions: ["DE", "BE"] },
  ]);
  assert.equal(resolvePctOfficeRule("BE")?.officeCode, "EP");
  assert.equal(resolvePctOfficeRule("LI")?.officeCode, "CH");
});

test("uses Chapter II but excludes overdue and inactive requests from the dashboard", () => {
  const pct = filingRequest("pct", "pct", ["filing"], {
    first_priority_date: "2023-01-31",
  });
  pct.translation_requirements = [{
    service_types: ["filing"],
    jurisdiction_codes: ["LU"],
    pct_chapter_code: "chapter_ii",
  }];
  const future = filingRequest("future", "paris_convention", ["filing"], {
    first_priority_date: "2026-01-01",
  });
  const completed = {
    ...future,
    id: "completed",
    requester_status: "completed",
  };

  const items = buildDashboardDeadlineItems([future, pct, completed], "2026-01-01");

  assert.equal(items.length, 1);
  assert.equal(items[0].dueOn, "2027-01-01");
  assert.equal(items[0].overdue, false);
  assert.equal(buildRequestDeadlineItems(pct, "2026-01-01")[0].overdue, true);
});

test("keeps inactive requests off the dashboard but calculates their detail deadline", () => {
  const completed = epRequest("completed", ["epv"], "", {
    grant_publication_date: "2026-01-31",
  });
  completed.requester_status = "completed";

  assert.equal(buildDashboardDeadlineItems([completed], "2026-02-01").length, 0);
  assert.deepEqual(
    buildRequestDeadlineItems(completed, "2026-02-01").map((item) => item.dueOn),
    ["2026-04-30"],
  );
});

test("explains why an EPV deadline is pending before the grant date exists", () => {
  const request = epRequest("pending", ["epv"], "unitary_effect", {});

  assert.equal(buildRequestDeadlineItems(request).length, 0);
  assert.equal(
    getRequestDeadlinePendingMessage(request),
    "Waiting for the official mention-of-grant publication date.",
  );
});

function epRequest(
  id: string,
  services: string[],
  epvType: string,
  patent: Record<string, string>,
): RequestDeadlineSource {
  return {
    ...activeRequest,
    id,
    channel_code: "ep",
    translation_requirements: [{
      service_types: services,
      epv_type_code: epvType,
      jurisdiction_codes: ["DE"],
    }],
    request_patents: [{ patent_number: `EP-${id}`, ...patent }],
  };
}

function filingRequest(
  id: string,
  channel: string,
  services: string[],
  patent: Record<string, string>,
): RequestDeadlineSource {
  return {
    ...activeRequest,
    id,
    channel_code: channel,
    translation_requirements: [{
      service_types: services,
      jurisdiction_codes: ["DE"],
    }],
    request_patents: [{ patent_number: `PAT-${id}`, ...patent }],
  };
}
