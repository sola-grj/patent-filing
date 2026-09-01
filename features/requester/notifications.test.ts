import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCompletedNotificationSeed,
  buildDeadlineNotificationSeeds,
  recentDistinctSearches,
  toRequesterNotificationItem,
} from "./notifications.ts";

test("recentDistinctSearches returns the latest three normalized unique queries", () => {
  assert.deepEqual(recentDistinctSearches([
    { query: "EP1000001A1", created_at: "2026-08-01T00:00:00Z" },
    { query: " ep1000001a1 ", created_at: "2026-08-04T00:00:00Z" },
    { query: "WO2026000002", created_at: "2026-08-03T00:00:00Z" },
    { query: "US202600003", created_at: "2026-08-02T00:00:00Z" },
    { query: "EP1000004", created_at: "2026-08-01T12:00:00Z" },
  ]), ["ep1000001a1", "WO2026000002", "US202600003"]);
});

test("completed notification requires completed state and a published deliverable", () => {
  const base = {
    id: "00000000-0000-0000-0000-000000000001",
    requester_id: "00000000-0000-0000-0000-000000000002",
    request_no: "REQ-100",
    title: "Example",
    requester_status: "completed",
    workflow_stage: "completed",
    updated_at: "2026-08-15T00:00:00Z",
    request_patents: [{ patent_number: "EP1000001" }],
  };

  assert.equal(buildCompletedNotificationSeed({ ...base, orders: [] }), null);
  const seed = buildCompletedNotificationSeed({
    ...base,
    orders: [{
      completed_at: "2026-08-16T00:00:00Z",
      translation_tasks: [{
        task_deliverables: [{ status: "submitted", created_at: "2026-08-16T00:00:00Z" }],
      }],
    }],
  });
  assert.equal(seed?.dedupe_key, `completed:${base.id}`);
  assert.equal(seed?.payload.matter, "EP1000001");
});

test("deadline seeds include today and exclude the next calendar month boundary", () => {
  const base = {
    id: "00000000-0000-0000-0000-000000000010",
    requester_id: "00000000-0000-0000-0000-000000000011",
    request_no: "REQ-200",
    channel_code: "paris_convention",
    submitted_at: "2026-01-01T00:00:00Z",
    workflow_stage: "production",
    requester_status: "in_progress",
    translation_requirements: [{ service_types: ["filing"] }],
  };
  const onToday = buildDeadlineNotificationSeeds([{
    ...base,
    request_patents: [{ first_priority_date: "2025-09-01" }],
  }], "2026-09-01");
  const onBoundary = buildDeadlineNotificationSeeds([{
    ...base,
    request_patents: [{ first_priority_date: "2025-10-01" }],
  }], "2026-09-01");

  assert.equal(onToday.length, 1);
  assert.match(onToday[0].dedupe_key, /^deadline:.*:paris_priority:2026-09-01$/);
  assert.equal(onBoundary.length, 0);
});

test("notification presentation uses only safe Requester request links", () => {
  const item = toRequesterNotificationItem({
    id: "notification-1",
    type: "request_completed",
    payload: {
      requestId: "00000000-0000-0000-0000-000000000001",
      requestNo: "REQ-1",
      matter: "EP1000001",
      href: "https://example.com/unsafe",
    },
    read_at: null,
    created_at: "2026-09-01T00:00:00Z",
  });

  assert.equal(item?.href, "/requester/requests/00000000-0000-0000-0000-000000000001");
});
