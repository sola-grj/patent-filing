import { notFound } from "next/navigation";
import { Suspense } from "react";

import { PmAccessDenied } from "@/features/pm/components/pm-access-denied";
import { PmRequestDetail } from "@/features/pm/components/pm-request-detail";
import { getPmRequestDetail } from "@/features/pm/queries";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function PmRequestDetailPage({
  params,
}: {
  params: Promise<{ requestId: string }>;
}) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading request...</p>}>
      <PmRequestDetailContent params={params} />
    </Suspense>
  );
}

async function PmRequestDetailContent({
  params,
}: {
  params: Promise<{ requestId: string }>;
}) {
  const { requestId } = await params;

  if (!uuidPattern.test(requestId)) {
    notFound();
  }

  const result = await getPmRequestDetail(requestId);

  if (result.denied) {
    return <PmAccessDenied />;
  }

  if (!result.request) {
    notFound();
  }

  return (
    <PmRequestDetail
      request={result.request}
      currentUserId={result.currentUserId}
    />
  );
}
