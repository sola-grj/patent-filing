import assert from "node:assert/strict";
import test from "node:test";

import { buildWizardDraftPayloadV2 } from "./draft-v2.ts";
import type { WizardPayload } from "./wizard-types.ts";

test("Draft v2 excludes lookup receipts, analysis receipts, and artifacts", () => {
  const payload = {
    sourceMode: "patent_search",
    patentQuery: "EP4132368A1",
    selectedPatent: {
      lookupReceipt: "lookup-secret",
    },
    selectedPatentFileIds: ["official-file"],
    uploadedFiles: [],
    analysis: {
      analysis_receipt: "analysis-secret",
      artifact: { artifact_id: "temporary-artifact" },
    },
    quoteCurrency: "EUR",
    config: {
      channelCode: "ep",
      sourceLanguage: "en",
      targetLanguages: [],
      translationRequired: false,
      epServiceType: "ep_granting",
      epCountryIds: [],
      optOutCountryIds: [],
      epCountriesConfirmed: false,
      optOutCountriesConfirmed: false,
      serviceItem: "",
      jurisdictionCodes: [],
      scopeType: "full_document",
      purpose: "european_validation",
      serviceTypes: [],
      qualityLevel: "human_translation",
      deliveryOption: "standard",
      isUrgent: false,
    },
    lastStep: "Configure",
  } as unknown as WizardPayload;

  const draft = buildWizardDraftPayloadV2(payload);
  const serialized = JSON.stringify(draft);

  assert.equal(draft.schemaVersion, 2);
  assert.equal(draft.patentQuery, "EP4132368A1");
  assert.equal(serialized.includes("lookup-secret"), false);
  assert.equal(serialized.includes("analysis-secret"), false);
  assert.equal(serialized.includes("temporary-artifact"), false);
  assert.equal("selectedPatent" in draft, false);
  assert.equal("analysis" in draft, false);
});
