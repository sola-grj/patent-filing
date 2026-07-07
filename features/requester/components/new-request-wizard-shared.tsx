import type { ReactNode } from "react";
import { X } from "lucide-react";

import type { WizardUploadedFile } from "@/features/requester/wizard-types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export function StepShell({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
      <div className="flex shrink-0 items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="mt-5 min-h-0 overflow-hidden">
        {children}
      </div>
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

export function Metric({
  title,
  value,
  action,
  detail,
}: {
  title: string;
  value: number | string;
  action?: ReactNode;
  detail?: ReactNode;
}) {
  return (
    <div className="rounded-md border p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-muted-foreground">{title}</p>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <p className="mt-2 text-2xl font-semibold">
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
      {detail ? (
        <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
      ) : null}
    </div>
  );
}

export function FileList({
  files,
  onRemove,
  className,
}: {
  files: WizardUploadedFile[];
  onRemove?: (index: number) => void;
  className?: string;
}) {
  if (!files.length) {
    return <p className="text-sm text-muted-foreground">No files selected yet.</p>;
  }

  return (
    <div className={`rounded-md border bg-background ${className ?? ""}`}>
      {files.map((file, index) => (
        <div
          key={`${file.name}-${file.size}-${index}`}
          className="flex items-center gap-3 border-b p-3 text-sm last:border-b-0"
        >
          <span className="min-w-0 flex-1 truncate">{file.name}</span>
          <span className="shrink-0 text-muted-foreground">
            {Math.ceil(file.size / 1024)} KB · {file.type || "unknown"}
          </span>
          {onRemove ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
              onClick={() => onRemove(index)}
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Remove file</span>
            </Button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
