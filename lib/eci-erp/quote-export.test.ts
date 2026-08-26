import assert from "node:assert/strict";
import test from "node:test";

import JSZip from "jszip";

import {
  generateQuoteExport,
  quoteExportFileName,
} from "./quote-export.ts";
import type { ErpQuotePreview } from "./types.ts";

const quote: ErpQuotePreview = {
  source: "eci_erp",
  currency: "USD",
  quotedAt: "2026-08-25T08:30:00.000Z",
  rows: [
    {
      countryId: 1001,
      countryName: "Europe",
      officialFee: 0,
      serviceFee: 7.76,
      translationFees: { "17": 500, "58": 700, "15": 600 },
      translationFee: 1800,
      translationFeeDetails: [
        { languageId: 17, languageName: "German (Germany)", amount: 500 },
        { languageId: 58, languageName: "Albanian (Albania)", amount: 700 },
        { languageId: 15, languageName: "French (France)", amount: 600 },
      ],
      total: 1807.76,
    },
  ],
  total: 1807.76,
};

const metadata = {
  serviceName: "Traditional Validation + Unitary Patent",
  patentNumber: "EP4279487B1",
};

test("generates a readable PDF estimate", async () => {
  const pdf = await generateQuoteExport("pdf", quote, metadata);
  assert.equal(Buffer.from(pdf).subarray(0, 5).toString(), "%PDF-");
  assert.ok(pdf.byteLength > 1000);
  assert.equal(
    quoteExportFileName("pdf", quote, metadata),
    "Pat-estimate-EP4279487B1-USD-20260825.pdf",
  );
});

test("generates an XLSX estimate with totals and language details", async () => {
  const xlsx = await generateQuoteExport("xlsx", quote, metadata);
  assert.equal(Buffer.from(xlsx).subarray(0, 2).toString(), "PK");
  const zip = await JSZip.loadAsync(xlsx);
  const sheet = await zip.file("xl/worksheets/sheet1.xml")!.async("string");
  assert.match(sheet, /Pat Estimate Sheet/);
  assert.match(sheet, /German \(Germany\): USD 500\.00/);
  assert.match(sheet, /<v>1807\.76<\/v>/);
  assert.equal(
    quoteExportFileName("xlsx", quote, metadata),
    "Pat-estimate-EP4279487B1-USD-20260825.xlsx",
  );
});
