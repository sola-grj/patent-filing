export const EPV_PATENT_NUMBER_ERROR =
  "For EP, enter an EPO patent publication number or application number. For patents from other countries, select FIling-Pairs Convention.";

export function patentNumberErrorForPath(
  channelCode: string,
  patentNumber: string,
) {
  if (channelCode !== "ep" || isEpoPatentNumber(patentNumber)) return null;
  return EPV_PATENT_NUMBER_ERROR;
}

export function isEpoPatentNumber(patentNumber: string) {
  const normalized = patentNumber
    .normalize("NFKC")
    .toUpperCase()
    .replace(/[\s._-]/g, "");

  return /^EP\d{7,9}(?:[A-Z]\d?)?$/.test(normalized);
}
