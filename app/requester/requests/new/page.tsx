import { Suspense } from "react";

import { FreshRequestWizard } from "@/features/requester/components/fresh-request-wizard";

export default function NewRequesterRequestPage() {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading request wizard...</p>}>
        <FreshRequestWizard />
      </Suspense>
    </div>
  );
}
