import { notFound } from "next/navigation";
import { Suspense } from "react";

import { RequestDetailView } from "@/features/requester/components/request-detail-view";
import { getRequesterRequest } from "@/features/requester/queries";

export default function RequestDetailPage({
  params,
}: {
  params: Promise<{ requestId: string }>;
}) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading request...</p>}>
      <RequestContent params={params} />
    </Suspense>
  );
}

async function RequestContent({
  params,
}: {
  params: Promise<{ requestId: string }>;
}) {
  const { requestId } = await params;
  const request = await getRequesterRequest(requestId);

  if (!request) {
    notFound();
  }

  return <RequestDetailView request={request} />;
}
