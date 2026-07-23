import { notFound } from "next/navigation";
import { Suspense } from "react";

import { PmAccessDenied } from "@/features/pm/components/pm-access-denied";
import { PmRequestDetail } from "@/features/pm/components/pm-request-detail";
import { getPmRequestDetail } from "@/features/pm/queries";

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
