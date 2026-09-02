export type FilingSignatureDirection =
  | "pm_to_requester"
  | "requester_to_pm";

export type FilingSignatureFile = {
  id: string;
  direction: FilingSignatureDirection;
  storage_bucket: string;
  storage_path: string;
  original_filename: string;
  mime_type: string;
  file_size: number;
  uploaded_by: string;
  ep_country_id?: number | null;
  created_at: string;
};

export type SignatureCountry = {
  id: number;
  name: string;
  abbr?: string;
};

export type SignatureUpload = {
  file: File;
  epCountryId: number | null;
};

export function appendSignatureUploads(
  formData: FormData,
  uploads: readonly SignatureUpload[],
) {
  for (const upload of uploads) {
    formData.append("files", upload.file);
    formData.append("fileCountryIds", upload.epCountryId?.toString() ?? "");
  }
}

export type FilingSignatureStatus =
  | "draft"
  | "sent"
  | "completed"
  | "cancelled";

export type FilingSignatureEmailStatus =
  | "not_sent"
  | "pending"
  | "sent"
  | "failed";

export type FilingSignatureRequest = {
  id: string;
  request_id: string;
  created_by: string;
  recipient_id: string;
  recipient_name?: string | null;
  recipient_email?: string | null;
  status: FilingSignatureStatus;
  pm_note?: string | null;
  due_at?: string | null;
  sent_at?: string | null;
  completed_at?: string | null;
  cancelled_at?: string | null;
  email_status: FilingSignatureEmailStatus;
  email_provider_id?: string | null;
  email_last_error?: string | null;
  email_sent_at?: string | null;
  email_attempt_count: number;
  created_at: string;
  updated_at: string;
  filing_signature_files?: FilingSignatureFile[] | null;
};

export function signatureFilesByDirection(
  request: FilingSignatureRequest,
  direction: FilingSignatureDirection,
) {
  return (request.filing_signature_files ?? [])
    .filter((file) => file.direction === direction)
    .sort(
      (left, right) =>
        new Date(left.created_at).getTime() - new Date(right.created_at).getTime(),
    );
}
