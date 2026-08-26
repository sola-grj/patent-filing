import assert from "node:assert/strict";
import test from "node:test";

import {
  getDefaultServiceTypeSelection,
  getServiceTypeSelections,
  isTraditionalValidation,
  requestPathLabels,
  requiresEpCountries,
  usesEpoTargetLanguages,
} from "./request-paths.ts";

test("defaults the only selectable service type", () => {
  const selection = getDefaultServiceTypeSelection(
    "ep",
    [],
    "",
    "",
    (option) => option.value === "ep_granting",
  );

  assert.equal(selection?.value, "ep_granting");
});

test("does not replace an existing service type selection", () => {
  const selection = getDefaultServiceTypeSelection(
    "ep",
    ["epv"],
    "unitary_effect",
    "unitary_patent",
    (option) => option.value === "ep_granting",
  );

  assert.equal(selection, undefined);
});

test("does not default when multiple service types are selectable", () => {
  const selection = getDefaultServiceTypeSelection(
    "pct",
    [],
    "",
    "",
  );

  assert.equal(selection, undefined);
});

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
  assert.equal(usesEpoTargetLanguages("traditional_validation_unitary_patent"), true);
});

test("Service Items are limited to Traditional and combined services", () => {
  assert.equal(isTraditionalValidation("traditional_validation"), true);
  assert.equal(isTraditionalValidation("traditional_validation_unitary_patent"), true);
  assert.equal(isTraditionalValidation("unitary_patent"), false);
  assert.equal(isTraditionalValidation(""), false);
});
