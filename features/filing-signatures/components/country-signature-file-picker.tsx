"use client";

import { FileUploadDropzone } from "@/components/ui/file-upload-dropzone";
import { FileList } from "@/features/requester/components/new-request-wizard-shared";

import type { SignatureCountry, SignatureUpload } from "../types";

export function CountrySignatureFilePicker({
  countries,
  disabled,
  inputKey,
  label,
  onChange,
  uploads,
}: {
  countries: SignatureCountry[];
  disabled: boolean;
  inputKey: number;
  label: string;
  onChange: (uploads: SignatureUpload[]) => void;
  uploads: SignatureUpload[];
}) {
  const options: Array<SignatureCountry | null> = countries.length ? countries : [null];
  return (
    <div className="space-y-4">
      {options.map((country) => {
        const countryId = country?.id ?? null;
        const selected = uploads.filter((upload) => upload.epCountryId === countryId);
        return (
          <div key={countryId ?? "general"} className={country ? "space-y-2 rounded-lg border p-4" : "space-y-2"}>
            {country ? <p className="text-sm font-medium">{country.name}</p> : null}
            <FileUploadDropzone
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.zip"
              disabled={disabled}
              inputKey={`${inputKey}-${countryId ?? "general"}`}
              label={country ? `Upload ${country.name} documents` : label}
              onFilesChange={(files) => onChange([
                ...uploads.filter((upload) => upload.epCountryId !== countryId),
                ...files.map((file) => ({ file, epCountryId: countryId })),
              ])}
            />
            {selected.length ? (
              <FileList
                files={selected.map((upload) => upload.file)}
                onRemove={(index) => onChange(
                  uploads.filter((upload) => upload !== selected[index]),
                )}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
