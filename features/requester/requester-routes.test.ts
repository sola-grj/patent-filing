import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFreshRequestHref,
  inferRequestPathFromSearch,
  normalizeRequestSearchTerm,
  parseRequestPath,
} from "./requester-routes.ts";

test("routes WO and PCT application numbers to Filing-PCT", () => {
  assert.equal(inferRequestPathFromSearch("WO/2026/148366"), "pct");
  assert.equal(inferRequestPathFromSearch("WO2026148366A1"), "pct");
  assert.equal(inferRequestPathFromSearch("PCT/AT2025/060357"), "pct");
});

test("routes EP and national publications to their matching paths", () => {
  assert.equal(inferRequestPathFromSearch("EP4686383A1"), "ep");
  assert.equal(inferRequestPathFromSearch("EP25188322.9"), "ep");
  assert.equal(inferRequestPathFromSearch("CN114302447A"), "paris_convention");
  assert.equal(inferRequestPathFromSearch("REQ-20260811-000091"), undefined);
});

test("builds a fresh request URL with the inferred path", () => {
  assert.equal(
    buildFreshRequestHref(123, "WO/2026/148366"),
    "/requester/requests/new?fresh=123&q=WO%2F2026%2F148366&path=pct",
  );
});

test("normalizes equivalent patent-number display formats", () => {
  assert.equal(
    normalizeRequestSearchTerm("WO/2026/148366"),
    "WO2026148366",
  );
  assert.equal(parseRequestPath("pct"), "pct");
  assert.equal(parseRequestPath("upload_files"), undefined);
});
