import JSZip from "jszip";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

import { buildEpGrantingQuoteTable, type EpGrantingFeeLine } from "./ep-granting-quote.ts";
import { optServiceStatusForCountry } from "./opt-service-status.ts";
import { quoteTermsSections } from "./quote-terms.ts";
import type { ErpQuotePreview, ErpQuoteRow } from "./types";

export type QuoteExportFormat = "pdf" | "xlsx";

export type QuoteExportMetadata = {
  serviceName: string;
  serviceType: string;
  serviceItem?: string;
  optOutCountryIds?: number[];
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

const traditionalQuoteColumns = [40, 260, 340, 420, 505, 555];
const traditionalTotalGap = 18;

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
  const colors = quotePdfColors();

  drawQuotationHeader(page, quote, regular, bold, "European Patent Granting Quotation", colors);
  drawCaseDetails(page, quote, metadata, regular, bold, 754, colors.muted);
  drawSectionHeading(page, "Quotation Details", 28, 572, bold, colors.navy);

  const columns = [28, 116, 242, 362, 459, 567];
  const summaryAmountRight = 559;
  let y = 545;
  page.drawRectangle({ x: 28, y: y - 8, width: 539, height: 25, color: colors.navy });
  const headers = ["Fee Category", "Fee Item", "Language / Scope", "Pricing Method", "Amount"];
  headers.forEach((header, index) => {
    const isAmount = index === headers.length - 1;
    drawPdfCellText(page, header, columns[index], columns[index + 1], y, 7.5, bold, colors.white, isAmount);
  });
  y -= 26;

  for (const line of table.baseFees) {
    drawEpGrantingFeeRow(page, line, columns, y, regular, bold, colors.paleNeutral, colors.navy);
    y -= 27;
  }
  for (const line of table.translationFees) {
    drawEpGrantingFeeRow(page, line, columns, y, regular, bold, colors.paleNeutral, colors.navy);
    y -= 27;
  }
  drawEpGrantingSubtotal(page, "Base Fee Subtotal", table.baseFeeSubtotal, quote.currency, summaryAmountRight, y, bold, colors.navy);
  y -= 27;
  if (table.translationFees.length) {
    drawEpGrantingSubtotal(page, "Translation Fee Subtotal", table.translationFeeSubtotal, quote.currency, summaryAmountRight, y, bold, colors.navy);
    y -= 27;
  }

  drawRightAligned(page, "Quotation Total", summaryAmountRight - 78, y + 3, 10, bold, colors.navy);
  drawRightAligned(page, money(table.total, quote.currency), summaryAmountRight, y + 3, 10, bold, colors.navy);

  drawQuotationFooter(page, regular, bold, colors);
  appendTermsAndConditions(document, regular, bold, colors);

  return document.save();
}

function drawCaseDetails(
  page: PDFPage,
  quote: ErpQuotePreview,
  metadata: QuoteExportMetadata,
  regular: PDFFont,
  bold: PDFFont,
  startY: number,
  muted: ReturnType<typeof rgb>,
) {
  const fields = caseDetailFields(quote, metadata);
  drawSectionHeading(page, "Case Details", 28, startY, bold, rgb(0.12, 0.15, 0.17));
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

function drawSectionHeading(
  page: PDFPage,
  title: string,
  x: number,
  y: number,
  font: PDFFont,
  color: ReturnType<typeof rgb>,
) {
  page.drawText(title, { x, y, size: 9.5, font, color });
}

function caseDetailFields(quote: ErpQuotePreview, metadata: QuoteExportMetadata): Array<[string, string]> {
  const patent = metadata.patentDetails;
  const isWipo = patent?.source === "wipo";
  const additionalDate = metadata.serviceType === "ep_granting"
    ? ["Rule 71(3) Dispatch Date", patent?.rule713DispatchDate]
    : ["Grant Date", patent?.grantDate];
  return [
    ["Title", patent?.title],
    ["Quotation Date", formatQuotationDate(quote.quotedAt)],
    [isWipo ? "International Application No." : "Application No.", metadata.applicationNumber || metadata.patentNumber],
    [isWipo ? "International Filing Date" : "Filing Date", patent?.filingDate],
    ["Publication No.", patent?.publicationNumber],
    ["Publication Date", patent?.publicationDate],
    ["First Priority Date", patent?.firstPriorityDate],
    ["Publication Language", patent?.publicationLanguage],
    additionalDate,
  ].filter((field): field is [string, string] => Boolean(field[1]));
}

const quotePdfBranding = {
  productName: "Pat",
  productDescriptor: "Patent translation workspace",
  contactHeading: "Company contact details",
  contactPlaceholder: "Address  |  Phone  |  Email",
};

function drawQuotationHeader(
  page: PDFPage,
  quote: ErpQuotePreview,
  regular: PDFFont,
  bold: PDFFont,
  title: string,
  colors: ReturnType<typeof quotePdfColors>,
) {
  page.drawRectangle({ x: 0, y: 787.89, width: 595.28, height: 54, color: colors.navy });
  drawPatMark(page, 35, 814.89, 18, colors.red);
  page.drawText(quotePdfBranding.productName, { x: 50, y: 808.89, size: 14, font: bold, color: colors.white });
  page.drawText(title, { x: 86, y: 807.89, size: 15, font: bold, color: colors.white });
  drawRightAligned(page, `Quotation Date: ${formatQuotationDate(quote.quotedAt)}`, 576, 796.89, 7.2, regular, colors.white);
}

function drawQuotationFooter(
  page: PDFPage,
  regular: PDFFont,
  bold: PDFFont,
  colors: ReturnType<typeof quotePdfColors>,
) {
  page.drawRectangle({ x: 0, y: 0, width: 595.28, height: 70, color: colors.navy });
  drawPatMark(page, 40, 36, 16, colors.red);
  page.drawText(quotePdfBranding.productName, { x: 57, y: 32, size: 12, font: bold, color: colors.white });
  page.drawText(quotePdfBranding.productDescriptor, { x: 57, y: 20, size: 6.8, font: regular, color: colors.white });
  drawRightAligned(page, quotePdfBranding.contactHeading, 567, 38, 8, bold, colors.white);
  drawRightAligned(page, quotePdfBranding.contactPlaceholder, 567, 22, 7, regular, colors.white);
}

function drawPatMark(
  page: PDFPage,
  centerX: number,
  centerY: number,
  diameter: number,
  red: ReturnType<typeof rgb>,
) {
  page.drawCircle({ x: centerX, y: centerY, size: diameter / 2, color: red });
  const unit = diameter / 24;
  drawPill(page, centerX, centerY + 4.4 * unit, 11.7 * unit, 2.9 * unit);
  drawPill(page, centerX - 3 * unit, centerY + 0.1 * unit, 5.9 * unit, 2.9 * unit);
  drawPill(page, centerX - 1.5 * unit, centerY - 4.3 * unit, 8.8 * unit, 2.9 * unit);
}

function drawPill(page: PDFPage, centerX: number, centerY: number, width: number, height: number) {
  const radius = height / 2;
  page.drawRectangle({
    x: centerX - width / 2 + radius,
    y: centerY - radius,
    width: width - height,
    height,
    color: rgb(1, 1, 1),
  });
  page.drawCircle({ x: centerX - width / 2 + radius, y: centerY, size: radius, color: rgb(1, 1, 1) });
  page.drawCircle({ x: centerX + width / 2 - radius, y: centerY, size: radius, color: rgb(1, 1, 1) });
}

function quotePdfColors() {
  return {
    navy: rgb(0.09, 0.22, 0.33),
    red: rgb(0.88, 0.13, 0.13),
    paleNeutral: rgb(0.96, 0.97, 0.98),
    muted: rgb(0.38, 0.43, 0.47),
    white: rgb(1, 1, 1),
  };
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
  currency: string,
  amountRight: number,
  y: number,
  font: PDFFont,
  color: ReturnType<typeof rgb>,
) {
  drawRightAligned(page, label, amountRight - 78, y, 10, font, color);
  drawRightAligned(page, money(amount, currency), amountRight, y, 10, font, color);
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
  const colors = quotePdfColors();
  const layout = { regular, bold, quote, metadata, colors };
  let page = addStandardQuotePage(document, layout);
  let y = 535;

  for (const row of quote.rows) {
    const rowHeight = 25;
    if (y - rowHeight < 118) {
      page = addStandardQuotePage(document, layout, true);
      y = 680;
    }
    drawPdfRow(page, row, regular, bold, y, metadata);
    y -= rowHeight;
  }

  let totalY = y - traditionalTotalGap;
  if (totalY < 200) {
    page = addStandardQuotePage(document, layout, true);
    totalY = 680;
  }
  drawRightAligned(page, "Quotation Total", 477, totalY, 10, bold, colors.navy);
  drawRightAligned(
    page,
    money(quote.total, quote.currency),
    traditionalQuoteColumns[5],
    totalY,
    10,
    bold,
    colors.navy,
  );
  appendTermsAndConditions(document, regular, bold, colors);
  return document.save();
}

function addStandardQuotePage(
  document: PDFDocument,
  layout: {
    regular: PDFFont;
    bold: PDFFont;
    quote: ErpQuotePreview;
    metadata: QuoteExportMetadata;
    colors: ReturnType<typeof quotePdfColors>;
  },
  continuation = false,
) {
  const page = document.addPage([595.28, 841.89]);
  const { regular, bold, quote, metadata, colors } = layout;
  drawQuotationHeader(
    page,
    quote,
    regular,
    bold,
    `${metadata.serviceName} Quotation${continuation ? " (continued)" : ""}`,
    colors,
  );
  if (!continuation) {
    drawCaseDetails(page, quote, metadata, regular, bold, 754, colors.muted);
    drawSectionHeading(page, "Quotation Details", 28, 574, bold, colors.navy);
  }
  drawPdfTableHeader(page, bold, continuation ? 710 : 550, colors);
  drawQuotationFooter(page, regular, bold, colors);
  return page;
}

function drawPdfTableHeader(
  page: PDFPage,
  font: PDFFont,
  y: number,
  colors: ReturnType<typeof quotePdfColors>,
) {
  page.drawRectangle({ x: 40, y: y - 7, width: 515, height: 22, color: colors.navy });
  page.drawText("Country / Service State", { x: 44, y, size: 8, font, color: colors.white });
  page.drawText("Official Fee", { x: 264, y, size: 8, font, color: colors.white });
  page.drawText("Service Fee", { x: 344, y, size: 8, font, color: colors.white });
  page.drawText("Translation Fee", { x: 424, y, size: 8, font, color: colors.white });
  page.drawText("Total", { x: 509, y, size: 8, font, color: colors.white });
}

function drawPdfRow(
  page: PDFPage,
  row: ErpQuoteRow,
  regular: PDFFont,
  bold: PDFFont,
  y: number,
  metadata: QuoteExportMetadata,
) {
  const columns = traditionalQuoteColumns;
  const border = rgb(0.72, 0.78, 0.82);
  page.drawRectangle({
    x: columns[0],
    y: y - 17,
    width: columns[5] - columns[0],
    height: 25,
    color: rgb(0.96, 0.97, 0.98),
    borderColor: border,
    borderWidth: 0.5,
  });
  page.drawText(pdfText(countryServiceLabel(row, metadata)), { x: 44, y, size: 8, font: bold });
  drawRightAligned(page, formatAmount(row.officialFee), 332, y, 8, regular);
  drawRightAligned(page, formatAmount(row.serviceFee), 412, y, 8, regular);
  drawRightAligned(page, formatAmount(row.translationFee), 497, y, 8, regular);
  drawRightAligned(page, formatAmount(row.total), 547, y, 8, regular);
  drawTraditionalRowBorders(page, columns, y, border);
}

function drawTraditionalRowBorders(
  page: PDFPage,
  columns: number[],
  y: number,
  border: ReturnType<typeof rgb>,
) {
  for (const x of columns.slice(1, -1)) {
    page.drawLine({ start: { x, y: y - 17 }, end: { x, y: y + 8 }, thickness: 0.5, color: border });
  }
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

function appendTermsAndConditions(
  document: PDFDocument,
  regular: PDFFont,
  bold: PDFFont,
  colors: ReturnType<typeof quotePdfColors>,
) {
  let page = addTermsPage(document, regular, bold, colors);
  let y = 742;

  for (const section of quoteTermsSections) {
    const headingLines = wrapPdfText(section.heading, bold, 9.5, 515);
    const contentLines = termsContentLines(section, regular);
    const requiredHeight = (headingLines.length * 14) + (contentLines.length * 10) + 12;

    if (y - requiredHeight < 90) {
      page = addTermsPage(document, regular, bold, colors);
      y = 742;
    }

    for (const line of headingLines) {
      page.drawText(pdfText(line), { x: 40, y, size: 9.5, font: bold, color: colors.navy });
      y -= 14;
    }
    for (const line of contentLines) {
      page.drawText(pdfText(line.text), {
        x: line.indent,
        y,
        size: 7.4,
        font: regular,
        color: colors.muted,
      });
      y -= 10;
    }
    y -= 12;
  }
}

function termsContentLines(
  section: (typeof quoteTermsSections)[number],
  font: PDFFont,
) {
  const lines: Array<{ text: string; indent: number }> = [];
  const bulletIndex = section.bulletsAfterParagraph ?? section.paragraphs.length;
  for (const [index, paragraph] of section.paragraphs.entries()) {
    lines.push(...wrapPdfText(paragraph, font, 7.4, 515).map((text) => ({ text, indent: 40 })));
    if (index + 1 === bulletIndex) {
      lines.push(...(section.bullets ?? []).flatMap((bullet) =>
        wrapPdfText(`- ${bullet}`, font, 7.4, 498).map((text) => ({ text, indent: 48 })),
      ));
    }
  }
  return lines;
}

function addTermsPage(
  document: PDFDocument,
  regular: PDFFont,
  bold: PDFFont,
  colors: ReturnType<typeof quotePdfColors>,
) {
  const page = document.addPage([595.28, 841.89]);
  page.drawText("Terms and Conditions", {
    x: 198,
    y: 782,
    size: 17,
    font: bold,
    color: colors.navy,
  });
  page.drawLine({
    start: { x: 40, y: 768 },
    end: { x: 555, y: 768 },
    thickness: 0.8,
    color: colors.red,
  });
  drawQuotationFooter(page, regular, bold, colors);
  return page;
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

function countryServiceLabel(row: ErpQuoteRow, metadata: QuoteExportMetadata) {
  const serviceStatus = optServiceStatusForCountry(
    metadata.serviceItem,
    row.countryId,
    metadata.optOutCountryIds,
  );
  return serviceStatus ? `${row.countryName} - ${serviceStatus}` : row.countryName;
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

function formatQuotationDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
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

function wrapPdfText(
  value: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
) {
  const words = pdfText(value).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
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
