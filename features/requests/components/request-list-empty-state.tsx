import Link from "next/link";
import { FilePlus2, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";

export function RequestListEmptyState({
  actionHref,
  title = "No requests found",
  description = "No requests match the current view. Create a new request to start a patent translation workflow.",
  actionLabel = "Create request",
}: {
  actionHref: string;
  title?: string;
  description?: string;
  actionLabel?: string;
}) {
  return (
    <div className="flex min-h-[18rem] flex-1 flex-col items-center justify-center px-6 py-12 text-center">
      <div className="flex size-14 items-center justify-center rounded-full border bg-muted/60 text-muted-foreground">
        <FilePlus2 className="size-6" aria-hidden="true" />
      </div>
      <h3 className="mt-5 text-base font-semibold text-foreground">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
        {description}
      </p>
      <Button asChild className="mt-6">
        <Link href={actionHref}>
          <Plus className="size-4" aria-hidden="true" />
          {actionLabel}
        </Link>
      </Button>
    </div>
  );
}
