import assert from "node:assert/strict";
import test from "node:test";

import {
  getServiceTypeSelections,
  isTraditionalValidation,
  requestPathLabels,
  requiresEpCountries,
  usesEpoTargetLanguages,
} from "./request-paths.ts";

test("EP route exposes the four base service types", () => {
  assert.equal(requestPathLabels.ep, "EP");
  assert.deepEqual(
    getServiceTypeSelections("ep").map((option) => option.label),
    [
      "EP Granting",
      "Traditional Validation",
      "Unitary Patent",
      "Traditional Validation + Unitary Patent",
    ],
  );
});

test("only services containing Traditional Validation require countries", () => {
  assert.equal(requiresEpCountries("ep_granting"), false);
  assert.equal(requiresEpCountries("traditional_validation"), true);
  assert.equal(requiresEpCountries("unitary_patent"), false);
  assert.equal(requiresEpCountries("traditional_validation_unitary_patent"), true);
});

test("the two non-Traditional EPO services use target languages", () => {
  assert.equal(usesEpoTargetLanguages("ep_granting"), true);
  assert.equal(usesEpoTargetLanguages("traditional_validation"), false);
  assert.equal(usesEpoTargetLanguages("unitary_patent"), true);
  assert.equal(usesEpoTargetLanguages("traditional_validation_unitary_patent"), false);
});

test("Service Items are limited to Traditional and combined services", () => {
  assert.equal(isTraditionalValidation("traditional_validation"), true);
  assert.equal(isTraditionalValidation("traditional_validation_unitary_patent"), true);
  assert.equal(isTraditionalValidation("unitary_patent"), false);
  assert.equal(isTraditionalValidation(""), false);
});
