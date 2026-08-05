"use client";

import { useId } from "react";
import { Upload } from "lucide-react";

import { cn } from "@/lib/utils";

export function FileUploadDropzone({
  accept,
  className,
  disabled = false,
  inputId,
  inputKey,
  label,
  multiple = true,
  onFilesChange,
}: {
  accept?: string;
  className?: string;
  disabled?: boolean;
  inputId?: string;
  inputKey?: number | string;
  label: string;
  multiple?: boolean;
  onFilesChange: (files: File[]) => void;
}) {
  const generatedId = useId();
  const resolvedInputId = inputId ?? `file-upload-${generatedId}`;

  return (
    <div className={cn("space-y-3", className)}>
      <input
        key={inputKey}
        id={resolvedInputId}
        type="file"
        multiple={multiple}
        accept={accept}
        className="sr-only"
        disabled={disabled}
        onChange={(event) =>
          onFilesChange(Array.from(event.target.files ?? []))
        }
      />
      <label
        htmlFor={resolvedInputId}
        className={cn(
          "flex min-h-20 items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-fuchsia-400 bg-white px-6 py-5 text-center text-fuchsia-600 transition-colors",
          disabled
            ? "cursor-not-allowed opacity-60"
            : "cursor-pointer hover:border-fuchsia-500 hover:bg-fuchsia-50/40",
        )}
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-fuchsia-300 bg-fuchsia-50">
          <Upload className="h-5 w-5" />
        </span>
        <span className="text-[1.125rem] font-semibold tracking-[-0.02em]">
          {label}
        </span>
      </label>
    </div>
  );
}
