import assert from "node:assert/strict";
import test from "node:test";

import {
  getServiceTypeSelections,
  isTraditionalValidation,
  requestPathLabels,
  requiresEpCountries,
} from "./request-paths.ts";

test("EP route exposes the six requested service types", () => {
  assert.equal(requestPathLabels.ep, "EP");
  assert.deepEqual(
    getServiceTypeSelections("ep").map((option) => option.label),
    [
      "EP Granting",
      "Traditional Validation",
      "Unitary Patent",
      "EP Granting + Translation",
      "Traditional Validation + Translation",
      "Unitary Patent + Translation",
    ],
  );
});

test("EP Granting does not require countries", () => {
  assert.equal(
    requiresEpCountries(["european_patent_grant_registration"]),
    false,
  );
  assert.equal(
    requiresEpCountries(["european_patent_grant_registration", "translation"]),
    false,
  );
  assert.equal(requiresEpCountries(["epv"]), true);
});

test("Opt Type is limited to Traditional Validation services", () => {
  assert.equal(isTraditionalValidation("traditional_validation"), true);
  assert.equal(isTraditionalValidation("unitary_effect"), false);
  assert.equal(isTraditionalValidation(""), false);
});
