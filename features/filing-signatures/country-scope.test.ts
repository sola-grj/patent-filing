import assert from "node:assert/strict";
import test from "node:test";

import {
  missingReturnCountryIds,
  signatureCountryScope,
  validateSignatureUploadCountries,
} from "./country-scope.ts";
import type { FilingSignatureFile, SignatureUpload } from "./types.ts";
import { validateSignatureFiles } from "./validation.ts";

test("scopes only traditional validation packages to configured countries", () => {
  assert.deepEqual(signatureCountryScope({
    ep_service_type_code: "traditional_validation_unitary_patent",
    ep_country_ids: [26, 41, 26],
  }), { countryScoped: true, countryIds: [26, 41] });
  assert.deepEqual(signatureCountryScope({
    ep_service_type_code: "ep_granting",
    ep_country_ids: [26],
  }), { countryScoped: false, countryIds: [] });
});

test("rejects invalid countries and country tags on flat packages", () => {
  const upload = (epCountryId: number | null) => ({
    file: {} as File,
    epCountryId,
  }) satisfies SignatureUpload;
  assert.doesNotThrow(() => validateSignatureUploadCountries(
    [upload(26)],
    { countryScoped: true, countryIds: [26, 41] },
  ));
  assert.throws(() => validateSignatureUploadCountries(
    [upload(99)],
    { countryScoped: true, countryIds: [26, 41] },
  ), /valid EP country/);
  assert.throws(() => validateSignatureUploadCountries(
    [upload(26)],
    { countryScoped: false, countryIds: [] },
  ), /does not accept country-specific/);
});

test("requires a requester return for every country actually sent by PM", () => {
  const file = (
    direction: FilingSignatureFile["direction"],
    epCountryId: number | null,
  ) => ({ direction, ep_country_id: epCountryId }) as FilingSignatureFile;
  const source = [
    file("pm_to_requester", 26),
    file("pm_to_requester", 26),
    file("pm_to_requester", 41),
  ];
  assert.deepEqual(missingReturnCountryIds(source, [
    file("requester_to_pm", 26),
  ]), [41]);
  assert.deepEqual(missingReturnCountryIds(source, [
    file("requester_to_pm", 26),
    file("requester_to_pm", 41),
  ]), []);
  assert.deepEqual(missingReturnCountryIds([
    file("pm_to_requester", null),
  ], [file("requester_to_pm", null)]), []);
});

test("keeps the package file-count and total-size limits", () => {
  const file = (size: number) => ({ name: "poa.pdf", size }) as File;
  assert.throws(
    () => validateSignatureFiles([file(1)], 10, 10),
    /at most 10 files/,
  );
  assert.throws(
    () => validateSignatureFiles([file(2 * 1024 * 1024)], 1, 99 * 1024 * 1024),
    /must not exceed 100 MB/,
  );
});
