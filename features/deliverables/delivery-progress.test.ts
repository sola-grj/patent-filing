import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDeliverySubmissionPlan,
  buildEpDeliverySubmissionPlan,
  buildSingleDeliverySubmissionPlan,
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

test("tracks new EP deliveries by source country id", () => {
  const plan = buildEpDeliverySubmissionPlan([201, 144, 1001, 201], [
    { id: "montenegro", ep_country_id: 201, status: "submitted" },
    { id: "germany", ep_country_id: 144, status: "draft" },
  ]);

  assert.deepEqual(plan.draftDeliverableIds, ["germany"]);
  assert.deepEqual(plan.deliveredCountryIds, [201, 144]);
  assert.deepEqual(plan.missingCountryIds, [1001]);
  assert.equal(plan.completesRequest, false);
});

test("completes a new EP Request after its last country id is delivered", () => {
  const plan = buildEpDeliverySubmissionPlan([201, 1001], [
    { id: "montenegro", ep_country_id: 201, status: "submitted" },
    { id: "europe", ep_country_id: 1001, status: "draft" },
  ]);

  assert.deepEqual(plan.newlyDeliveredCountryIds, [1001]);
  assert.deepEqual(plan.missingCountryIds, []);
  assert.equal(plan.completesRequest, true);
});

test("keeps EP country ids separate from legacy country codes", () => {
  const deliverables = latestPublishedDeliverables([
    { id: "ep-de", ep_country_id: 144, status: "submitted", version_no: 1 },
    { id: "legacy-de", jurisdiction_code: "DE", status: "submitted", version_no: 1 },
  ]);

  assert.deepEqual(deliverables.map((deliverable) => deliverable.id), ["ep-de", "legacy-de"]);
});

test("submits one general delivery without a country binding", () => {
  const plan = buildSingleDeliverySubmissionPlan([
    { id: "general-draft", status: "draft" },
    { id: "country-draft", ep_country_id: 144, status: "draft" },
  ]);

  assert.deepEqual(plan.draftDeliverableIds, ["general-draft"]);
  assert.equal(plan.completesRequest, true);
});
