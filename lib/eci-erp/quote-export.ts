import JSZip from "jszip";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

import { buildEpGrantingQuoteTable, type EpGrantingFeeLine } from "./ep-granting-quote.ts";
import type { ErpQuotePreview, ErpQuoteRow } from "./types";

export type QuoteExportFormat = "pdf" | "xlsx";

export type QuoteExportMetadata = {
  serviceName: string;
  serviceType: string;
  patentNumber: string;
  applicationNumber: string;
  translationRequired: boolean;
  patentDetails?: {
    title?: string;
    source?: "epo" | "wipo";
    filingDate?: string;
    publicationNumber?: string;
    publicationDate?: string;
    firstPriorityDate?: string;
    publicationLanguage?: string;
    grantDate?: string;
    rule713DispatchDate?: string;
  };
};

export async function generateQuoteExport(
  format: QuoteExportFormat,
  quote: ErpQuotePreview,
  metadata: QuoteExportMetadata,
) {
  return format === "pdf"
    ? metadata.serviceType === "ep_granting"
      ? generateEpGrantingQuotePdf(quote, metadata)
      : generateQuotePdf(quote, metadata)
    : generateQuoteXlsx(quote, metadata);
}

export function quoteExportFileName(
  format: QuoteExportFormat,
  quote: ErpQuotePreview,
  metadata: QuoteExportMetadata,
) {
  const patent = safeFilePart(metadata.patentNumber || "patent");
  const date = quote.quotedAt.slice(0, 10).replaceAll("-", "");
  return `Pat-estimate-${patent}-${quote.currency}-${date}.${format}`;
}

async function generateEpGrantingQuotePdf(
  quote: ErpQuotePreview,
  metadata: QuoteExportMetadata,
) {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const page = document.addPage([595.28, 841.89]);
  const table = buildEpGrantingQuoteTable(quote, metadata.translationRequired);
  const colors = {
    navy: rgb(0.09, 0.22, 0.33),
    blue: rgb(0.18, 0.44, 0.56),
    paleBlue: rgb(0.91, 0.95, 0.97),
    paleOrange: rgb(1, 0.94, 0.87),
    orange: rgb(0.72, 0.35, 0),
    muted: rgb(0.38, 0.43, 0.47),
    white: rgb(1, 1, 1),
  };

  page.drawRectangle({ x: 28, y: 764, width: 539, height: 50, color: colors.navy });
  page.drawText("European Patent Granting Quotation", {
    x: 42,
    y: 783,
    size: 19,
    font: bold,
    color: colors.white,
  });
  page.drawText("Commercial quotation for EP granting services", {
    x: 42,
    y: 744,
    size: 8.5,
    font: regular,
    color: colors.muted,
  });

  drawCaseDetails(page, metadata, regular, bold, 719, colors.muted);

  const columns = [28, 116, 242, 362, 459, 567];
  let y = 570;
  page.drawRectangle({ x: 28, y: y - 8, width: 539, height: 25, color: colors.blue });
  const headers = ["Fee Category", "Fee Item", "Language / Scope", "Pricing Method", "Amount"];
  headers.forEach((header, index) => {
    const isAmount = index === headers.length - 1;
    drawPdfCellText(page, header, columns[index], columns[index + 1], y, 7.5, bold, colors.white, isAmount);
  });
  y -= 26;

  for (const line of table.baseFees) {
    drawEpGrantingFeeRow(page, line, columns, y, regular, bold, colors.paleBlue, colors.muted);
    y -= 27;
  }
  drawEpGrantingSubtotal(page, "Base Fee Subtotal", table.baseFeeSubtotal, columns, y, bold, colors.paleBlue, colors.navy);
  y -= 27;

  for (const line of table.translationFees) {
    drawEpGrantingFeeRow(page, line, columns, y, regular, bold, colors.paleOrange, colors.orange);
    y -= 27;
  }
  if (table.translationFees.length) {
    drawEpGrantingSubtotal(page, "Translation Fee Subtotal", table.translationFeeSubtotal, columns, y, bold, colors.paleOrange, colors.orange);
    y -= 27;
  }

  page.drawRectangle({ x: 28, y: y - 8, width: 539, height: 32, color: colors.navy });
  page.drawText("Quotation Total", {
    x: 302,
    y: y + 3,
    size: 11,
    font: bold,
    color: colors.white,
  });
  drawRightAligned(page, money(table.total, quote.currency), 555, y + 3, 12, bold, colors.white);

  const notesY = y - 122;
  page.drawRectangle({ x: 28, y: notesY, width: 539, height: 82, color: rgb(0.96, 0.97, 0.98) });
  const notes = [
    "Notes",
    "EPO official fees are shown as disbursements and are based on the amount charged by the authority.",
    "All amounts are pre-tax. This quotation remains valid until the EP granting deadline shown above.",
  ];
  page.drawText(notes[0], { x: 42, y: notesY + 60, size: 8.5, font: bold, color: colors.navy });
  page.drawText(notes[1], { x: 42, y: notesY + 39, size: 7.5, font: regular, color: colors.muted });
  page.drawText(notes[2], { x: 42, y: notesY + 21, size: 7.5, font: regular, color: colors.muted });
  page.drawText("Private and confidential", { x: 28, y: 43, size: 7, font: regular, color: colors.muted });
  drawRightAligned(page, "Pat", 567, 43, 7, bold, colors.muted);

  return document.save();
}

function drawCaseDetails(
  page: PDFPage,
  metadata: QuoteExportMetadata,
  regular: PDFFont,
  bold: PDFFont,
  startY: number,
  muted: ReturnType<typeof rgb>,
) {
  const fields = caseDetailFields(metadata);
  page.drawText("Case Details", { x: 40, y: startY, size: 9.5, font: bold });
  const title = fields.find(([label]) => label === "Title");
  const remainingFields = fields.filter(([label]) => label !== "Title");
  let row = 0;

  if (title) {
    drawCaseDetail(page, title[0], title[1], 40, 82, startY - 23, 465, regular, bold, muted);
    row = 1;
  }

  remainingFields.forEach(([label, value], index) => {
    const column = index % 2;
    const y = startY - 23 - (row + Math.floor(index / 2)) * 20;
    const labelX = column === 0 ? 40 : 310;
    drawCaseDetail(page, label, value, labelX, labelX + 96, y, 157, regular, bold, muted);
  });
}

function drawCaseDetail(
  page: PDFPage,
  label: string,
  value: string,
  labelX: number,
  valueX: number,
  y: number,
  maxValueWidth: number,
  regular: PDFFont,
  bold: PDFFont,
  muted: ReturnType<typeof rgb>,
) {
  page.drawText(label, { x: labelX, y, size: 7.2, font: regular, color: muted });
  page.drawText(fitPdfText(value, bold, 8.2, maxValueWidth), { x: valueX, y, size: 8.2, font: bold });
}

function caseDetailFields(metadata: QuoteExportMetadata): Array<[string, string]> {
  const patent = metadata.patentDetails;
  const isWipo = patent?.source === "wipo";
  const additionalDate = metadata.serviceType === "ep_granting"
    ? ["Rule 71(3) Dispatch Date", patent?.rule713DispatchDate]
    : ["Grant Date", patent?.grantDate];
  return [
    ["Title", patent?.title],
    [isWipo ? "International Application No." : "Application No.", metadata.applicationNumber || metadata.patentNumber],
    [isWipo ? "International Filing Date" : "Filing Date", patent?.filingDate],
    ["Publication No.", patent?.publicationNumber],
    ["Publication Date", patent?.publicationDate],
    ["First Priority Date", patent?.firstPriorityDate],
    ["Publication Language", patent?.publicationLanguage],
    additionalDate,
  ].filter((field): field is [string, string] => Boolean(field[1]));
}

function drawEpGrantingFeeRow(
  page: PDFPage,
  line: EpGrantingFeeLine,
  columns: number[],
  y: number,
  regular: PDFFont,
  bold: PDFFont,
  background: ReturnType<typeof rgb>,
  accent: ReturnType<typeof rgb>,
) {
  page.drawRectangle({ x: columns[0], y: y - 8, width: columns[5] - columns[0], height: 27, color: background });
  const values = [line.category, line.item, line.scope, line.pricingMethod];
  values.forEach((value, index) => {
    drawPdfCellText(page, value, columns[index], columns[index + 1], y, 7.4, index === 0 ? bold : regular, index === 0 ? accent : rgb(0.12, 0.15, 0.17));
  });
  const amount = line.waived ? `${formatAmount(line.amount)}  Waived` : formatAmount(line.amount);
  drawPdfCellText(page, amount, columns[4], columns[5], y, 7.4, line.waived ? bold : regular, line.waived ? accent : rgb(0.12, 0.15, 0.17), true);
  drawPdfRowBorders(page, columns, y);
}

function drawEpGrantingSubtotal(
  page: PDFPage,
  label: string,
  amount: number,
  columns: number[],
  y: number,
  font: PDFFont,
  background: ReturnType<typeof rgb>,
  color: ReturnType<typeof rgb>,
) {
  page.drawRectangle({ x: columns[0], y: y - 8, width: columns[5] - columns[0], height: 27, color: background });
  drawRightAligned(page, label, columns[4] - 8, y, 8, font, color);
  drawRightAligned(page, formatAmount(amount), columns[5] - 12, y, 8, font, color);
  drawPdfRowBorders(page, columns, y);
}

function drawPdfCellText(
  page: PDFPage,
  value: string,
  left: number,
  right: number,
  y: number,
  size: number,
  font: PDFFont,
  color: ReturnType<typeof rgb>,
  alignRight = false,
) {
  const fitted = fitPdfText(value, font, size, right - left - 12);
  const x = alignRight ? right - 8 - font.widthOfTextAtSize(fitted, size) : left + 7;
  page.drawText(fitted, { x, y, size, font, color });
}

function drawPdfRowBorders(page: PDFPage, columns: number[], y: number) {
  const border = rgb(0.78, 0.83, 0.86);
  for (const x of columns) {
    page.drawLine({ start: { x, y: y - 8 }, end: { x, y: y + 19 }, thickness: 0.35, color: border });
  }
  page.drawLine({ start: { x: columns[0], y: y - 8 }, end: { x: columns[5], y: y - 8 }, thickness: 0.35, color: border });
}

function fitPdfText(value: string, font: PDFFont, size: number, maxWidth: number) {
  const text = pdfText(value);
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let fitted = text;
  while (fitted.length && font.widthOfTextAtSize(`${fitted}...`, size) > maxWidth) {
    fitted = fitted.slice(0, -1);
  }
  return `${fitted}...`;
}

async function generateQuotePdf(
  quote: ErpQuotePreview,
  metadata: QuoteExportMetadata,
) {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const layout = { regular, bold, quote, metadata };
  let page = addPdfPage(document, layout);
  let y = 585;

  for (const row of quote.rows) {
    const detailLines = wrapText(translationDetailForPdf(row), 82);
    const rowHeight = 25 + detailLines.length * 10;
    if (y - rowHeight < 70) {
      page = addPdfPage(document, layout, true);
      y = 735;
    }
    drawPdfRow(page, row, regular, y, detailLines);
    y -= rowHeight;
  }

  page.drawLine({ start: { x: 40, y: y + 3 }, end: { x: 555, y: y + 3 }, thickness: 1, color: rgb(0.18, 0.24, 0.22) });
  page.drawText("Estimated Total", { x: 390, y: y - 18, size: 10, font: bold });
  drawRightAligned(page, money(quote.total, quote.currency), 555, y - 18, 11, bold);
  return document.save();
}

function addPdfPage(
  document: PDFDocument,
  layout: {
    regular: PDFFont;
    bold: PDFFont;
    quote: ErpQuotePreview;
    metadata: QuoteExportMetadata;
  },
  continuation = false,
) {
  const page = document.addPage([595.28, 841.89]);
  const { regular, bold, metadata } = layout;
  page.drawText(continuation ? "Pat Estimate Sheet (continued)" : "Pat Estimate Sheet", {
    x: 40,
    y: 792,
    size: continuation ? 15 : 22,
    font: bold,
    color: rgb(0.08, 0.22, 0.18),
  });
  if (!continuation) {
    drawCaseDetails(page, metadata, regular, bold, 755, rgb(0.35, 0.4, 0.38));
  }
  drawPdfTableHeader(page, bold, continuation ? 755 : 615);
  page.drawText("Generated from the current estimate. Private and confidential.", {
    x: 40,
    y: 35,
    size: 7,
    font: regular,
    color: rgb(0.45, 0.48, 0.47),
  });
  return page;
}

function drawPdfTableHeader(page: PDFPage, font: PDFFont, y: number) {
  page.drawRectangle({ x: 40, y: y - 7, width: 515, height: 22, color: rgb(0.92, 0.95, 0.94) });
  page.drawText("Countries", { x: 44, y, size: 8, font });
  page.drawText("Official", { x: 266, y, size: 8, font });
  page.drawText("Service", { x: 350, y, size: 8, font });
  page.drawText("Translation", { x: 423, y, size: 8, font });
  page.drawText("Total", { x: 524, y, size: 8, font });
}

function drawPdfRow(
  page: PDFPage,
  row: ErpQuoteRow,
  font: PDFFont,
  y: number,
  detailLines: string[],
) {
  page.drawText(pdfText(row.countryName), { x: 44, y, size: 8, font });
  drawRightAligned(page, formatAmount(row.officialFee), 330, y, 8, font);
  drawRightAligned(page, formatAmount(row.serviceFee), 410, y, 8, font);
  drawRightAligned(page, formatAmount(row.translationFee), 495, y, 8, font);
  drawRightAligned(page, formatAmount(row.total), 555, y, 8, font);
  detailLines.forEach((line, index) => {
    page.drawText(pdfText(line), {
      x: 52,
      y: y - 12 - index * 10,
      size: 7,
      font,
      color: rgb(0.4, 0.44, 0.42),
    });
  });
  page.drawLine({ start: { x: 40, y: y - 17 - detailLines.length * 10 }, end: { x: 555, y: y - 17 - detailLines.length * 10 }, thickness: 0.4, color: rgb(0.82, 0.84, 0.83) });
}

function drawRightAligned(
  page: PDFPage,
  value: string,
  right: number,
  y: number,
  size: number,
  font: PDFFont,
  color?: ReturnType<typeof rgb>,
) {
  const text = pdfText(value);
  page.drawText(text, {
    x: right - font.widthOfTextAtSize(text, size),
    y,
    size,
    font,
    ...(color ? { color } : {}),
  });
}

async function generateQuoteXlsx(
  quote: ErpQuotePreview,
  metadata: QuoteExportMetadata,
) {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", contentTypesXml());
  zip.file("_rels/.rels", rootRelationshipsXml());
  zip.file("docProps/app.xml", appPropertiesXml());
  zip.file("docProps/core.xml", corePropertiesXml(quote.quotedAt));
  zip.file("xl/workbook.xml", workbookXml());
  zip.file("xl/_rels/workbook.xml.rels", workbookRelationshipsXml());
  zip.file("xl/styles.xml", stylesXml());
  zip.file("xl/worksheets/sheet1.xml", worksheetXml(quote, metadata));
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

function worksheetXml(quote: ErpQuotePreview, metadata: QuoteExportMetadata) {
  const rows: string[][] = [
    ["Pat Estimate Sheet"],
    ["Service", metadata.serviceName],
    ["Patent", metadata.patentNumber || "-"],
    ["Generated", formatDate(quote.quotedAt)],
    ["Currency", quote.currency],
    [],
    ["Countries", "Official Fee", "Service Fee", "Translation Fee", "Translation Details", "Total"],
  ];
  for (const row of quote.rows) {
    rows.push([
      row.countryName,
      String(row.officialFee),
      String(row.serviceFee),
      String(row.translationFee),
      translationDetail(row, quote.currency),
      String(row.total),
    ]);
  }
  rows.push(["", "", "", "", "Estimated Total", String(quote.total)]);

  const sheetRows = rows.map((values, rowIndex) => {
    const rowNumber = rowIndex + 1;
    const cells = values.map((value, columnIndex) => {
      const reference = `${columnName(columnIndex + 1)}${rowNumber}`;
      const isMoneyCell = rowNumber >= 8
        && [2, 3, 4, 6].includes(columnIndex + 1);
      const style = rowNumber === 1 ? 3 : rowNumber === 7 ? 1 : isMoneyCell ? 2 : 0;
      return isMoneyCell
        ? `<c r="${reference}" s="${style}"><v>${Number(value)}</v></c>`
        : `<c r="${reference}" t="inlineStr" s="${style}"><is><t>${xml(value)}</t></is></c>`;
    }).join("");
    return `<row r="${rowNumber}">${cells}</row>`;
  }).join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="7" topLeftCell="A8" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <cols><col min="1" max="1" width="28" customWidth="1"/><col min="2" max="4" width="16" customWidth="1"/><col min="5" max="5" width="55" customWidth="1"/><col min="6" max="6" width="16" customWidth="1"/></cols>
  <sheetData>${sheetRows}</sheetData>
  <mergeCells count="1"><mergeCell ref="A1:F1"/></mergeCells>
</worksheet>`;
}

function contentTypesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;
}

function rootRelationshipsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;
}

function workbookXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Estimate" sheetId="1" r:id="rId1"/></sheets></workbook>`;
}

function workbookRelationshipsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
}

function stylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="0.00"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEAF2EF"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFill="1" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
}

function corePropertiesXml(quotedAt: string) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:creator>Pat</dc:creator><cp:lastModifiedBy>Pat</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${xml(quotedAt)}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${xml(quotedAt)}</dcterms:modified></cp:coreProperties>`;
}

function appPropertiesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Pat</Application></Properties>`;
}

function translationDetail(row: ErpQuoteRow, currency: string) {
  if (!row.translationFeeDetails.length) return "-";
  return row.translationFeeDetails
    .map((fee) => `${fee.languageName}: ${money(fee.amount, currency)}`)
    .join("; ");
}

function translationDetailForPdf(row: ErpQuoteRow) {
  if (!row.translationFeeDetails.length) return "-";
  return row.translationFeeDetails
    .map((fee) => `${fee.languageName}: ${formatAmount(fee.amount)}`)
    .join("; ");
}

function money(value: number, currency: string) {
  return `${currency} ${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

function formatAmount(value: number) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function safeFilePart(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-").slice(0, 80) || "patent";
}

function pdfText(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E]/g, "?");
}

function wrapText(value: string, maxLength: number) {
  if (value === "-") return [];
  const words = value.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (line && `${line} ${word}`.length > maxLength) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function columnName(index: number) {
  let value = index;
  let result = "";
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function xml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
