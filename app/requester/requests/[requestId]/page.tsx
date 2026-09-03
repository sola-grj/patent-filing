import { notFound } from "next/navigation";
import { Suspense } from "react";

import { RequestDetailView } from "@/features/requester/components/request-detail-view";
import type { RequestDetailTab } from "@/features/requests/components/request-detail-tabs";
import { getRequesterRequest } from "@/features/requester/queries";

export default function RequestDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ requestId: string }>;
  searchParams: Promise<{ source?: string; tab?: string }>;
}) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading request...</p>}>
      <RequestContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function RequestContent({
  params,
  searchParams,
}: {
  params: Promise<{ requestId: string }>;
  searchParams: Promise<{ source?: string; tab?: string }>;
}) {
  const { requestId } = await params;
  const { source, tab } = await searchParams;
  const request = await getRequesterRequest(requestId);

  if (!request) {
    notFound();
  }

  return <RequestDetailView request={request} initialTab={resolveInitialTab(source, tab)} />;
}

function resolveInitialTab(source: string | undefined, tab: string | undefined): RequestDetailTab {
  if (source !== "message") return "overview";
  if (tab === "quotation" || tab === "signatures" || tab === "patent") return tab;
  return "overview";
}
