import { notFound } from "next/navigation";
import { Suspense } from "react";

import { NewRequestWizard } from "@/features/requester/components/new-request-wizard";
import { getRequesterDraft } from "@/features/requester/queries";

export default function RequesterDraftEditorPage({
  params,
}: {
  params: Promise<{ draftId: string }>;
}) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading draft...</p>}>
      <DraftEditorContent params={params} />
    </Suspense>
  );
}

async function DraftEditorContent({
  params,
}: {
  params: Promise<{ draftId: string }>;
}) {
  const { draftId } = await params;
  const draft = await getRequesterDraft(draftId);

  if (!draft) {
    notFound();
  }

  return (
    <div className="flex h-[calc(100dvh-8.5rem)] min-h-[calc(100dvh-8.5rem)] max-h-[calc(100dvh-8.5rem)] flex-1 flex-col overflow-hidden">
      <NewRequestWizard initialDraft={draft} />
    </div>
  );
}
