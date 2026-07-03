import { Suspense } from "react";

import { FreshRequestWizard } from "@/features/requester/components/fresh-request-wizard";

export default function NewRequesterRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ fresh?: string }>;
}) {
  return (
    <div className="flex h-[calc(100dvh-8.5rem)] min-h-[calc(100dvh-8.5rem)] max-h-[calc(100dvh-8.5rem)] flex-1 flex-col overflow-hidden">
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading request wizard...</p>}>
        <FreshRequestWizard searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
