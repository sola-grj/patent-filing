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
