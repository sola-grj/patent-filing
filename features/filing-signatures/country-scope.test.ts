import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
    ep_service_type_code: "traditional_validation_unitary_patent",
    ep_country_ids: [26, 41, 68],
  }, [26, 68]), { countryScoped: true, countryIds: [26, 68] });
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

test("maps exactly the 25 workbook POA countries to fixed dictionary IDs", () => {
  const dictionarySql = readFileSync(new URL(
    "../../supabase/migrations/20260818013634_import_ep_country_language_dictionaries.sql",
    import.meta.url,
  ), "utf8");
  const poaSql = readFileSync(new URL(
    "../../supabase/migrations/20260910114436_add_poa_country_requirements_and_confirmations.sql",
    import.meta.url,
  ), "utf8");
  const dictionaryBlock = dictionarySql.match(
    /insert into public\.ep_countries[\s\S]*?values([\s\S]*?);\s*insert into public\.patent_language_options/i,
  )?.[1] ?? "";
  const countries = new Map(
    [...dictionaryBlock.matchAll(/\(\s*(\d+)\s*,\s*'([^']+)'/g)]
      .map((match) => [Number(match[1]), match[2]] as const),
  );
  const expectedOriginal = new Map([
    [133, "Albania"],
    [156, "Moldova"],
    [182, "Macedonia"],
  ]);
  const expectedScanned = new Map([
    [26, "Morocco"],
    [41, "Tunisia"],
    [68, "Switzerland & Liechtenstein"],
    [93, "Cyprus"],
    [138, "Bulgaria"],
    [139, "Czech Republic"],
    [146, "Greece"],
    [147, "Hungary"],
    [148, "Iceland"],
    [149, "Ireland"],
    [150, "Italy"],
    [153, "Lithuania"],
    [159, "Norway"],
    [160, "Poland"],
    [162, "Romania"],
    [164, "San Marino"],
    [165, "Slovakia"],
    [166, "Slovenia"],
    [171, "Serbia"],
    [183, "Croatia"],
    [189, "Bosnia and Herzegovina"],
    [201, "Montenegro"],
  ]);
  const nonWorkbookDictionaryIds = new Set([82, 94, 101, 103, 105, 108, 127]);
  const workbookCountryCount = [...countries.keys()]
    .filter((id) => !nonWorkbookDictionaryIds.has(id)).length;

  assert.equal(countries.size, 49);
  assert.equal(workbookCountryCount, 42);
  assert.equal(expectedOriginal.size + expectedScanned.size, 25);
  assert.equal(workbookCountryCount - expectedOriginal.size - expectedScanned.size, 17);
  for (const [id, name] of [...expectedOriginal, ...expectedScanned]) {
    assert.equal(countries.get(id), name);
  }
  assert.deepEqual(idsFromPoaUpdate(poaSql, "original"), [...expectedOriginal.keys()]);
  assert.deepEqual(idsFromPoaUpdate(poaSql, "scanned_copy"), [...expectedScanned.keys()]);
});

test("locks country confirmations behind RLS and an authenticated PM RPC", () => {
  const sql = readFileSync(new URL(
    "../../supabase/migrations/20260910114436_add_poa_country_requirements_and_confirmations.sql",
    import.meta.url,
  ), "utf8");

  assert.match(sql, /enable row level security/);
  assert.match(sql, /unique \(signature_request_id, ep_country_id\)/);
  assert.match(sql, /security definer\s+set search_path = ''/);
  assert.match(sql, /if not public\.is_platform_staff\(\)/);
  assert.match(sql, /private\.is_supplier_staff_for_request/);
  assert.match(sql, /country\.poa_requirement <> 'not_required'/);
  assert.match(sql, /returned_file\.direction = 'requester_to_pm'/);
  assert.match(sql, /on conflict \(signature_request_id, ep_country_id\) do nothing/);
  assert.match(sql, /revoke all on function public\.confirm_filing_signature_country\(uuid, integer\)\s+from public, anon/);
  assert.match(sql, /grant execute on function public\.confirm_filing_signature_country\(uuid, integer\)\s+to authenticated/);
});

function idsFromPoaUpdate(sql: string, requirement: "original" | "scanned_copy") {
  const values = sql.match(new RegExp(
    `set poa_requirement = '${requirement}'\\s+where id in \\(([^)]+)\\)`,
    "i",
  ))?.[1] ?? "";
  return values.split(",").map((value) => Number(value.trim()));
}
