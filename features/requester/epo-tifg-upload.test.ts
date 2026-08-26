import assert from "node:assert/strict";
import test from "node:test";

import {
  isCustomerTifgUpload,
  isEpGrantingTranslation,
  isVerifiedCustomerTifg,
  requiresCustomerTifg,
  requiresPatentDocumentAnalysis,
  shouldStartAutomaticPatentAnalysis,
} from "./epo-tifg-upload.ts";

const verifiedTifg = {
  input_mode: "upload",
  status: "success",
  analysis_profile: "claims_only",
  analysis_receipt: "analysis-receipt",
  source_document: {
    document_kind: "text_intended_for_grant_customer_upload",
    retrieval_mode: "customer_upload",
    is_pre_grant: true,
  },
  files: [{
    status: "success",
    parts: {
      abstract: { status: "not_present", word_count: 0 },
      abstract_drawing: { status: "not_present", word_count: 0 },
      description: { status: "not_present", word_count: 0 },
      description_drawings: { status: "not_present", word_count: 0 },
      claims: { status: "parsed", word_count: 476 },
      unclassified: { status: "not_present", word_count: 0 },
    },
  }],
  aggregate: { claims_words: 476 },
};

test("accepts only a verified customer-uploaded pre-grant TIFG", () => {
  assert.equal(isVerifiedCustomerTifg(verifiedTifg), true);
  assert.equal(isVerifiedCustomerTifg({
    ...verifiedTifg,
    source_document: {
      document_kind: "B1",
      retrieval_mode: "customer_upload",
      is_pre_grant: false,
    },
  }), false);
  assert.equal(isVerifiedCustomerTifg({
    ...verifiedTifg,
    source_document: {
      ...verifiedTifg.source_document,
      retrieval_mode: "automatic",
    },
  }), false);
});

test("distinguishes an uploaded TIFG from a quote-ready claims result", () => {
  const partial = { ...verifiedTifg, status: "partial" };
  assert.equal(isCustomerTifgUpload(partial), true);
  assert.equal(isVerifiedCustomerTifg(partial), false);
  assert.equal(isVerifiedCustomerTifg({
    ...verifiedTifg,
    analysis_profile: "full_document",
  }), false);
  assert.equal(isVerifiedCustomerTifg({
    ...verifiedTifg,
    aggregate: { claims_words: 0 },
  }), false);
  assert.equal(isVerifiedCustomerTifg({
    ...verifiedTifg,
    analysis_receipt: null,
  }), false);
  assert.equal(isVerifiedCustomerTifg({
    ...verifiedTifg,
    files: [...verifiedTifg.files, verifiedTifg.files[0]],
  }), false);
  assert.equal(isVerifiedCustomerTifg({
    ...verifiedTifg,
    files: [{ ...verifiedTifg.files[0], status: "partial" }],
  }), false);
  assert.equal(isVerifiedCustomerTifg({
    ...verifiedTifg,
    files: [{
      ...verifiedTifg.files[0],
      parts: {
        ...verifiedTifg.files[0].parts,
        claims: { status: "parse_failed", word_count: 0 },
      },
    }],
  }), false);
});

test("identifies EP Granting translation independently from parse state", () => {
  assert.equal(isEpGrantingTranslation({
    channelCode: "ep",
    epServiceType: "ep_granting",
    translationRequired: true,
  }), true);
  assert.equal(isEpGrantingTranslation({
    channelCode: "ep",
    epServiceType: "ep_granting",
    translationRequired: false,
  }), false);
});

test("EP Granting requires the verified customer TIFG", () => {
  assert.equal(requiresCustomerTifg({
    channelCode: "ep",
    epServiceType: "ep_granting",
    translationRequired: true,
    analysis: undefined,
  }), true);
  assert.equal(requiresCustomerTifg({
    channelCode: "ep",
    epServiceType: "ep_granting",
    translationRequired: true,
    analysis: verifiedTifg,
  }), false);
  assert.equal(requiresCustomerTifg({
    channelCode: "ep",
    epServiceType: "unitary_patent",
    translationRequired: true,
    analysis: undefined,
  }), false);
  assert.equal(requiresCustomerTifg({
    channelCode: "ep",
    epServiceType: "ep_granting",
    translationRequired: false,
    analysis: undefined,
  }), false);
});

test("EP Granting without translation does not require document analysis", () => {
  assert.equal(requiresPatentDocumentAnalysis({
    channelCode: "ep",
    epServiceType: "ep_granting",
    translationRequired: false,
  }), false);
  assert.equal(requiresPatentDocumentAnalysis({
    channelCode: "ep",
    epServiceType: "ep_granting",
    translationRequired: true,
  }), true);
  assert.equal(requiresPatentDocumentAnalysis({
    channelCode: "ep",
    epServiceType: "unitary_patent",
    translationRequired: false,
  }), true);
});

test("automatic analysis is deferred for EP Granting", () => {
  assert.equal(shouldStartAutomaticPatentAnalysis({
    channelCode: "ep",
    epServiceType: "",
  }), false);
  assert.equal(shouldStartAutomaticPatentAnalysis({
    channelCode: "ep",
    epServiceType: "ep_granting",
  }), false);
  assert.equal(shouldStartAutomaticPatentAnalysis({
    channelCode: "ep",
    epServiceType: "traditional_validation",
  }), true);
  assert.equal(shouldStartAutomaticPatentAnalysis({
    channelCode: "pct",
    epServiceType: "",
  }), true);
});
