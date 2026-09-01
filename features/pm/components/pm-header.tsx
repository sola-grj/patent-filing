import type { ReactNode } from "react";

export function PmHeader({
  title,
  description,
  action,
  status,
  showEyebrow = true,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  status?: ReactNode;
  showEyebrow?: boolean;
}) {
  return (
    <div className="border-b pb-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          {showEyebrow ? (
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Pat PM
            </p>
          ) : null}
          <div className={`${showEyebrow ? "mt-2 " : ""}flex flex-wrap items-center gap-3`}>
            <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
            {status}
          </div>
          {description ? (
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </div>
  );
}
