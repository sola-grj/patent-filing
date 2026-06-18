import type { ReactNode } from "react";

import type { WizardUploadedFile } from "@/features/requester/wizard-types";
import { Label } from "@/components/ui/label";

export function StepShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

export function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  );
}

export function Metric({ title, value }: { title: string; value: number | string }) {
  return (
    <div className="rounded-md border p-4">
      <p className="text-sm text-muted-foreground">{title}</p>
      <p className="mt-2 text-2xl font-semibold">
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
    </div>
  );
}

export function FileList({ files }: { files: WizardUploadedFile[] }) {
  if (!files.length) {
    return <p className="text-sm text-muted-foreground">No files selected yet.</p>;
  }

  return (
    <div className="divide-y rounded-md border">
      {files.map((file) => (
        <div key={`${file.name}-${file.size}`} className="flex items-center justify-between p-3 text-sm">
          <span>{file.name}</span>
          <span className="text-muted-foreground">
            {Math.ceil(file.size / 1024)} KB · {file.type || "unknown"}
          </span>
        </div>
      ))}
    </div>
  );
}
