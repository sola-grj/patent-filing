import type { ReactNode } from "react";

export function RequesterHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="border-b pb-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Requester
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{title}</h1>
        {description ? (
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p>
        ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </div>
  );
}
