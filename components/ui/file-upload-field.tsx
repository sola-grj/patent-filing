import { FileArchive, Upload } from "lucide-react";

import { cn } from "@/lib/utils";

export function FileUploadField({
  accept,
  description,
  disabled,
  inputKey,
  label,
  onFileChange,
  selectedFile,
}: {
  accept?: string;
  description?: string;
  disabled?: boolean;
  inputKey?: number | string;
  label: string;
  onFileChange: (file: File | null) => void;
  selectedFile?: File | null;
}) {
  return (
    <div
      className={cn(
        "relative rounded-xl border border-dashed bg-muted/20 p-4 transition-colors",
        disabled
          ? "cursor-not-allowed opacity-60"
          : "cursor-pointer hover:border-foreground/30 hover:bg-muted/30",
      )}
    >
      <input
        key={inputKey}
        type="file"
        accept={accept}
        aria-label={label}
        className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        disabled={disabled}
        onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
      />
      <div className="flex items-start gap-3">
        <div className="rounded-lg border bg-background p-2 text-muted-foreground">
          {selectedFile ? <FileArchive /> : <Upload />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{label}</p>
          {description ? (
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {description}
            </p>
          ) : null}
          <div className="mt-4">
            <div className="min-w-0 flex-1 rounded-lg border bg-background/70 px-3 py-2 text-sm">
              <p className="truncate font-medium">
                {selectedFile ? selectedFile.name : "No file selected"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {selectedFile ? formatFileSize(selectedFile.size) : "ZIP only"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatFileSize(size: number) {
  if (size < 1024 * 1024) {
    return `${Math.max(1, Math.round(size / 102.4) / 10)} KB`;
  }

  return `${Math.round((size / (1024 * 1024)) * 10) / 10} MB`;
}
