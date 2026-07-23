import type { ReactNode } from "react";

export function PmHeader({
  title,
  description,
  action,
  status,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  status?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 border-b pb-6 md:flex-row md:items-end md:justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Patentia PM
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
          {status}
        </div>
        {description ? (
          <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
