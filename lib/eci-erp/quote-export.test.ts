import assert from "node:assert/strict";
import test from "node:test";
import { inflateSync } from "node:zlib";

import JSZip from "jszip";
import { PDFDocument, PDFName, PDFRawStream } from "pdf-lib";

import { buildEpGrantingQuoteTable, quoteValidUntilTimestamp } from "./ep-granting-quote.ts";
import { optServiceStatusForCountry } from "./opt-service-status.ts";
import {
  generateQuoteExport,
  quoteExportFileName,
} from "./quote-export.ts";
import type { ErpQuotePreview } from "./types.ts";

const quote: ErpQuotePreview = {
  source: "eci_erp",
  currency: "USD",
  quotedAt: "2026-08-25T08:30:00.000Z",
  customerName: "Client20031901",
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
  serviceType: "traditional_validation_unitary_patent",
  patentNumber: "EP4279487B1",
  applicationNumber: "EP22738959.0",
  translationRequired: true,
  serviceItem: "traditional_validation_opt_out",
  optOutCountryIds: [1001],
  patentDetails: {
    title: "Fall protection device on roofs",
    source: "epo" as const,
    filingDate: "2013-09-18",
    publicationNumber: "EP2767652A2",
    publicationDate: "2014-08-20",
    firstPriorityDate: "2013-02-14",
    publicationLanguage: "English",
    grantDate: "2026-04-29",
  },
};

const epGrantingQuote: ErpQuotePreview = {
  source: "eci_erp",
  currency: "USD",
  quotedAt: "2026-08-26T02:15:00.000Z",
  customerName: "Example Client",
  validUntil: "2026-12-04",
  rows: [
    {
      countryId: 1001,
      countryName: "Europe",
      officialFee: 427.04,
      serviceFee: 7.76,
      translationFees: { "17": 0, "15": 300 },
      translationFee: 300,
      translationFeeDetails: [
        { languageId: 15, languageName: "French (France)", amount: 300 },
        { languageId: 17, languageName: "German (Germany)", amount: 0 },
      ],
      total: 734.8,
    },
  ],
  total: 734.8,
};

const epGrantingMetadata = {
  serviceName: "EP Granting",
  serviceType: "ep_granting",
  patentNumber: "EP4041749A1",
  applicationNumber: "EP20793085.8",
  translationRequired: true,
  patentDetails: {
    title: "Example EP Granting Case",
    source: "epo" as const,
    filingDate: "2020-08-26",
    publicationNumber: "EP4041749A1",
    publicationDate: "2022-08-17",
    firstPriorityDate: "2019-08-26",
    publicationLanguage: "English",
    rule713DispatchDate: "2026-08-04",
  },
};

test("generates a readable PDF estimate", async () => {
  const pdf = await generateQuoteExport("pdf", quote, metadata);
  assert.equal(Buffer.from(pdf).subarray(0, 5).toString(), "%PDF-");
  assert.ok(pdf.byteLength > 1000);
  const content = extractPdfContent(await PDFDocument.load(pdf));
  assert.match(content, /Case Details/);
  assert.match(content, /Quotation Details/);
  assert.match(content, /Fall protection device on roofs/);
  assert.match(content, /Grant Date/);
  assert.match(content, /Country \/ Service State/);
  assert.match(content, /Quotation Date/);
  assert.match(content, /Aug 25, 2026/);
  assert.match(content, /Quotation Date: Aug 25, 2026/);
  assert.doesNotMatch(content, /^QUOTATION$/m);
  assert.match(content, /Company contact details/);
  assert.match(content, /Opt Out/);
  assert.match(content, /USD 1,807\.76/);
  assert.match(content, /Terms and Conditions/);
  assert.match(content, /11\. Assignment/);
  assert.match(content, /Translation Fee/);
  assert.doesNotMatch(content, /German \(Germany\)/);
  assert.doesNotMatch(content, /Pre-tax/);
  assert.doesNotMatch(content, /Notes/);
  assert.doesNotMatch(content, /USD 0\.00/);
  assert.doesNotMatch(content, /German \(Germany\): USD/);
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

test("builds separate EP Granting language lines and keeps waived languages", () => {
  const table = buildEpGrantingQuoteTable(epGrantingQuote, true);
  assert.deepEqual(
    table.baseFees.map((line) => [line.item, line.scope, line.amount]),
    [
      ["Professional Service Fee", "EP Granting", 7.76],
      ["EPO Official Fee", "European Patent Office", 427.04],
    ],
  );
  assert.deepEqual(
    table.translationFees.map((line) => [line.scope, line.amount, line.waived]),
    [
      ["French", 300, false],
      ["German", 0, true],
    ],
  );
  assert.equal(table.baseFeeSubtotal, 434.8);
  assert.equal(table.translationFeeSubtotal, 300);
  assert.equal(table.total, 734.8);
});

test("omits the EP Granting translation group when translation is not required", () => {
  const table = buildEpGrantingQuoteTable(epGrantingQuote, false);
  assert.deepEqual(table.translationFees, []);
  assert.equal(table.translationFeeSubtotal, 0);
});

test("uses Shanghai end of day for the EP Granting deadline and keeps the seven-day fallback", () => {
  assert.equal(
    quoteValidUntilTimestamp("2026-12-04"),
    "2026-12-04T23:59:59.999+08:00",
  );
  assert.equal(
    quoteValidUntilTimestamp(undefined, Date.parse("2026-08-26T00:00:00.000Z")),
    "2026-09-02T00:00:00.000Z",
  );
});

test("generates an EP Granting quotation with its Terms and Conditions appendix", async () => {
  const pdf = await generateQuoteExport("pdf", epGrantingQuote, epGrantingMetadata);
  assert.equal(Buffer.from(pdf).subarray(0, 5).toString(), "%PDF-");
  const document = await PDFDocument.load(pdf);
  assert.ok(document.getPageCount() > 1);
  const content = extractPdfContent(document);
  for (const expected of [
    "European Patent Granting Quotation",
    "Case Details",
    "Example EP Granting Case",
    "EP20793085.8",
    "Base Fee Subtotal",
    "Translation Fee Subtotal",
    "French",
    "German",
    "Waived",
    "Quotation Total",
    "USD 434.80",
    "USD 300.00",
    "USD 734.80",
    "Rule 71(3) Dispatch Date",
    "Terms and Conditions",
    "11. Assignment",
  ]) {
    assert.match(content, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  for (const forbidden of ["Quotation Number", "Quantity", "Unit Price", "Description", "Source URL", "Notes"]) {
    assert.doesNotMatch(content, new RegExp(forbidden));
  }
});

test("generates an EP Granting PDF without translation rows when translation is not required", async () => {
  const pdf = await generateQuoteExport(
    "pdf",
    epGrantingQuote,
    { ...epGrantingMetadata, translationRequired: false },
  );
  const content = extractPdfContent(await PDFDocument.load(pdf));
  assert.doesNotMatch(content, /Claims Translation/);
  assert.doesNotMatch(content, /Translation Fee Subtotal/);
});

test("places EP Granting subtotals after all fee detail rows", async () => {
  const pdf = await generateQuoteExport("pdf", epGrantingQuote, epGrantingMetadata);
  const content = extractPdfContent(await PDFDocument.load(pdf));
  assert.ok(content.indexOf("German") < content.indexOf("Base Fee Subtotal"));
  assert.ok(content.indexOf("Base Fee Subtotal") < content.indexOf("Translation Fee Subtotal"));
  assert.ok(content.indexOf("Translation Fee Subtotal") < content.indexOf("Quotation Total"));
});

test("maps service items to per-country Opt Out and Opt In labels", () => {
  assert.equal(optServiceStatusForCountry("traditional_validation_opt_out", 2, [2]), "Opt Out");
  assert.equal(optServiceStatusForCountry("traditional_validation_opt_out", 1, [2]), null);
  assert.equal(optServiceStatusForCountry("opt_out_only", 1), "Opt Out");
  assert.equal(optServiceStatusForCountry("opt_in_only", 1), "Opt In");
  assert.equal(optServiceStatusForCountry("traditional_validation", 1), null);
});

test("keeps each traditional-validation country as a separate row without language detail lines", async () => {
  const rows = [
    { ...quote.rows[0], countryId: 58, countryName: "Albania", total: 618.4 },
    { ...quote.rows[0], countryId: 15, countryName: "Austria", total: 1243 },
  ];
  const pdf = await generateQuoteExport("pdf", { ...quote, rows, total: 1861.4 }, {
    ...metadata,
    optOutCountryIds: [58, 15],
  });
  const content = extractPdfContent(await PDFDocument.load(pdf));

  assert.match(content, /Albania - Opt Out/);
  assert.match(content, /Austria - Opt Out/);
  assert.match(content, /Translation Fee/);
  assert.doesNotMatch(content, /German \(Germany\)/);
});

test("repeats the branded table header on later pages and omits unrelated Opt labels", async () => {
  const rows = Array.from({ length: 20 }, (_, index) => ({
    ...quote.rows[0],
    countryId: index + 1,
    countryName: `Country ${index + 1}`,
    translationFeeDetails: [],
    translationFees: {},
    translationFee: 0,
    total: 7.76,
  }));
  const pdf = await generateQuoteExport("pdf", { ...quote, rows, total: 155.2 }, {
    ...metadata,
    serviceItem: "traditional_validation",
    optOutCountryIds: [],
  });
  const document = await PDFDocument.load(pdf);
  const content = extractPdfContent(document);
  assert.ok(document.getPageCount() > 1);
  assert.ok(content.split("Country / Service State").length - 1 >= 2);
  assert.doesNotMatch(content, /Opt Out|Opt In/);
});

function extractPdfContent(document: PDFDocument) {
  const chunks: string[] = [];
  for (const [, object] of document.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFRawStream)) continue;
    const filter = object.dict.get(PDFName.of("Filter"));
    const bytes = filter === PDFName.of("FlateDecode")
      ? inflateSync(object.getContents())
      : object.getContents();
    const content = Buffer.from(bytes).toString("latin1");
    chunks.push(content.replace(/<([0-9A-F]+)> Tj/g, (_, hex: string) => (
      Buffer.from(hex, "hex").toString("latin1")
    )));
  }
  return chunks.join("\n");
}
