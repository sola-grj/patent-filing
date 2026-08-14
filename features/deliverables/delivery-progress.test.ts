import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDeliverySubmissionPlan,
  latestPublishedDeliverables,
} from "./delivery-progress.ts";

test("keeps the Request active after a partial country delivery", () => {
  const plan = buildDeliverySubmissionPlan(["DE", "FR", "ES"], [
    { id: "de-1", jurisdiction_code: "DE", status: "draft" },
    { id: "fr-1", jurisdiction_code: "FR", status: "draft" },
  ]);

  assert.deepEqual(plan.draftDeliverableIds, ["de-1", "fr-1"]);
  assert.deepEqual(plan.deliveredJurisdictionCodes, ["DE", "FR"]);
  assert.deepEqual(plan.missingJurisdictionCodes, ["ES"]);
  assert.equal(plan.completesRequest, false);
});

test("completes the Request when the last country is delivered", () => {
  const plan = buildDeliverySubmissionPlan(["DE", "FR", "ES"], [
    { id: "de-1", jurisdiction_code: "DE", status: "submitted" },
    { id: "fr-1", jurisdiction_code: "FR", status: "submitted" },
    { id: "es-1", jurisdiction_code: "ES", status: "draft" },
  ]);

  assert.deepEqual(plan.draftDeliverableIds, ["es-1"]);
  assert.deepEqual(plan.missingJurisdictionCodes, []);
  assert.equal(plan.completesRequest, true);
});

test("shows only the latest published version for each country", () => {
  const deliverables = latestPublishedDeliverables([
    { id: "de-1", jurisdiction_code: "DE", status: "submitted", version_no: 1 },
    { id: "de-2", jurisdiction_code: "DE", status: "submitted", version_no: 2 },
    { id: "fr-draft", jurisdiction_code: "FR", status: "draft", version_no: 1 },
    { id: "fr-1", jurisdiction_code: "FR", status: "accepted", version_no: 1 },
  ]);

  assert.deepEqual(deliverables.map((deliverable) => deliverable.id), ["de-2", "fr-1"]);
});
