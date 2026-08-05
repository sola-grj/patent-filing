import { Clock3 } from "lucide-react";

import { Card } from "@/components/ui/card";
import { requirePmContext } from "@/features/pm/server-utils";

import { PmAccessDenied } from "./pm-access-denied";
import { PmHeader } from "./pm-header";

export async function PmComingSoon({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  const context = await requirePmContext();

  if (context.denied) {
    return <PmAccessDenied />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-6 overflow-hidden">
      <PmHeader title={title} description={description} />
      <Card className="flex min-h-64 flex-1 items-center justify-center rounded-xl p-8 text-center shadow-sm">
        <div className="max-w-md">
          <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-brand-soft text-brand-soft-foreground">
            <Clock3 className="size-5" />
          </span>
          <h2 className="mt-4 text-lg font-semibold">Coming soon</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            This workspace is reserved for a future Pat PM release.
          </p>
        </div>
      </Card>
    </div>
  );
}
