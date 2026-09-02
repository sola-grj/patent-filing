export const MAX_SIGNATURE_FILE_BYTES = 50 * 1024 * 1024;
export const MAX_SIGNATURE_BATCH_BYTES = 100 * 1024 * 1024;
export const MAX_SIGNATURE_FILE_COUNT = 10;

const allowedExtensions = [
  ".pdf",
  ".doc",
  ".docx",
  ".jpg",
  ".jpeg",
  ".png",
  ".zip",
] as const;

const mimeByExtension: Record<string, string> = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".zip": "application/zip",
};

export function signatureFilesFromFormData(formData: FormData, field: string) {
  return formData
    .getAll(field)
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);
}

export function signatureUploadsFromFormData(
  formData: FormData,
  fileField = "files",
  countryField = "fileCountryIds",
) {
  const files = signatureFilesFromFormData(formData, fileField);
  const countries = formData.getAll(countryField);
  return files.map((file, index) => {
    const value = countries[index];
    const epCountryId = typeof value === "string" && value.trim()
      ? Number(value)
      : null;
    if (epCountryId !== null && (!Number.isInteger(epCountryId) || epCountryId <= 0)) {
      throw new Error("A signature file has an invalid EP country.");
    }
    return { file, epCountryId };
  });
}

export function validateSignatureFiles(
  files: readonly File[],
  existingCount = 0,
  existingBytes = 0,
) {
  if (existingCount + files.length > MAX_SIGNATURE_FILE_COUNT) {
    throw new Error(`A signature package can contain at most ${MAX_SIGNATURE_FILE_COUNT} files.`);
  }

  for (const file of files) {
    if (!file.size) {
      throw new Error("Empty files cannot be uploaded.");
    }
    if (file.size > MAX_SIGNATURE_FILE_BYTES) {
      throw new Error("Each signature file must not exceed 50 MB.");
    }
    signatureFileContentType(file);
  }

  const totalBytes = files.reduce((total, file) => total + file.size, existingBytes);
  if (totalBytes > MAX_SIGNATURE_BATCH_BYTES) {
    throw new Error("The combined signature package must not exceed 100 MB.");
  }
}

export function signatureFileContentType(file: File) {
  const extension = allowedExtensions.find((item) =>
    file.name.toLowerCase().endsWith(item),
  );

  if (!extension) {
    throw new Error("Only PDF, DOC, DOCX, JPG, PNG, and ZIP files are supported.");
  }

  return mimeByExtension[extension];
}

export function validateSignatureDueDate(value: string | null) {
  if (!value) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Signature due date must be a valid date.");
  }

  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Signature due date must be a valid date.");
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (date < today) {
    throw new Error("Signature due date cannot be in the past.");
  }

  return value;
}
