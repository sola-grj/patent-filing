import assert from "node:assert/strict";
import test from "node:test";

import { resolveRequesterRequestScope } from "./request-scope.ts";

test("Request sharing defaults to the current user's Requests", () => {
  assert.equal(resolveRequesterRequestScope(false), "mine");
});

test("an organization scope request is ignored while sharing is disabled", () => {
  assert.equal(resolveRequesterRequestScope(false, "organization"), "mine");
});

test("organization scope is available only while sharing is enabled", () => {
  assert.equal(resolveRequesterRequestScope(true, "organization"), "organization");
});
