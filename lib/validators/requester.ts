import { allowedUploadExtensions } from "@/features/requester/options";

export type ActionResult<T = undefined> = {
  success: boolean;
  data?: T;
  error?: string;
};

export function requiredString(value: FormDataEntryValue | null, label: string) {
  const text = typeof value === "string" ? value.trim() : "";

  if (!text) {
    throw new Error(`${label} is required.`);
  }

  return text;
}

export function optionalString(value: FormDataEntryValue | null) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function optionalNumber(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function getTomorrowDateInputValue(fromDate = new Date()) {
  const tomorrow = new Date(fromDate);
  tomorrow.setHours(0, 0, 0, 0);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return formatDateInputValue(tomorrow);
}

export function validateFutureDateString(value: string | null | undefined, label: string) {
  const text = value?.trim() ?? "";

  if (!text) {
    throw new Error(`${label} is required.`);
  }

  const parsed = parseDateInputValue(text);
  if (!parsed) {
    throw new Error(`${label} must be a valid date.`);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (parsed <= today) {
    throw new Error(`${label} must be later than today.`);
  }

  return text;
}

export function validateUploadFile(file: File) {
  const lowerName = file.name.toLowerCase();
  const isAllowed = allowedUploadExtensions.some((extension) =>
    lowerName.endsWith(extension),
  );

  if (!file.size) {
    throw new Error("Please choose a file to upload.");
  }

  if (!isAllowed) {
    throw new Error("Only PDF, DOC, DOCX, XML, and TXT files are supported.");
  }
}

function parseDateInputValue(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }

  const [, year, month, day] = match;
  const parsed = new Date(Number(year), Number(month) - 1, Number(day));
  parsed.setHours(0, 0, 0, 0);

  if (
    parsed.getFullYear() !== Number(year) ||
    parsed.getMonth() !== Number(month) - 1 ||
    parsed.getDate() !== Number(day)
  ) {
    return null;
  }

  return parsed;
}

function formatDateInputValue(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
