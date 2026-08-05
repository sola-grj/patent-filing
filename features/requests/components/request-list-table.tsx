import type { ReactNode } from "react";
import Link from "next/link";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function RequestListTable({
  columns,
  gridClassName,
  minWidthClassName,
  hasRows,
  emptyState,
  children,
}: {
  columns: ReactNode[];
  gridClassName: string;
  minWidthClassName: string;
  hasRows: boolean;
  emptyState: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl shadow-sm">
      <CardContent className="min-h-0 flex-1 overflow-auto p-0">
        <div className={cn("flex min-h-full flex-col", minWidthClassName)}>
          <div
            className={cn(
              gridClassName,
              "sticky top-0 z-10 shrink-0 items-center gap-5 border-b bg-card px-7 py-4 text-sm font-semibold text-foreground shadow-[0_1px_0_hsl(var(--border))]",
            )}
          >
            {columns.map((column, index) => (
              <span key={index}>{column}</span>
            ))}
          </div>
          {hasRows ? (
            <div className="divide-y">{children}</div>
          ) : (
            emptyState
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function RequestListRow({
  href,
  gridClassName,
  children,
}: {
  href: string;
  gridClassName: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        gridClassName,
        "items-center gap-5 px-7 py-4 text-sm transition-colors hover:bg-muted/50",
      )}
    >
      {children}
    </Link>
  );
}
