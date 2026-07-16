import { notFound } from "next/navigation";
import { Suspense } from "react";

import { NewRequestWizard } from "@/features/requester/components/new-request-wizard";
import {
  getRequesterDictionaries,
  getRequesterDraft,
} from "@/features/requester/queries";

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
  const [draft, dictionaries] = await Promise.all([
    getRequesterDraft(draftId),
    getRequesterDictionaries(),
  ]);

  if (!draft) {
    notFound();
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <NewRequestWizard initialDraft={draft} dictionaries={dictionaries} />
    </div>
  );
}
