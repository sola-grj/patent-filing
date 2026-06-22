import Link from "next/link";
import { Suspense } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { PaginationNav } from "@/components/ui/pagination";
import { RequesterHeader } from "@/features/requester/components/requester-header";
import { formatDate } from "@/features/requester/format";
import { getRequesterDrafts } from "@/features/requester/queries";

export default function RequesterDraftsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading drafts...</p>}>
      <DraftsContent searchParams={searchParams} />
    </Suspense>
  );
}

async function DraftsContent({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const page = Number(params.page ?? "1");
  const { organization, drafts, totalCount, totalPages } = await getRequesterDrafts({
    page: Number.isFinite(page) ? page : 1,
  });

  if (!organization) {
    return <RequesterHeader title="My drafts" description="Create a requester workspace from the dashboard first." />;
  }

  return (
    <div className="space-y-8">
      <RequesterHeader title="My drafts" description="Drafts do not have a detail page. Open one to continue editing the request wizard." />
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{totalCount} drafts found</span>
        <span>Page {Math.min(Math.max(1, page || 1), totalPages)} of {totalPages}</span>
      </div>
      <Card>
        <CardContent className="p-0">
          {drafts.length ? (
            <div className="divide-y">
              {drafts.map((draft) => (
                <Link
                  key={draft.id}
                  href={`/requester/drafts/${draft.id}`}
                  className="grid gap-3 p-4 text-sm hover:bg-muted/50 md:grid-cols-[1.4fr_1fr_1fr_auto]"
                >
                  <span>
                    <strong>{draft.request_no}</strong>
                    <span className="block text-muted-foreground">{draft.title ?? "Untitled draft"}</span>
                  </span>
                  <span>{draft.source_mode === "upload" ? "Upload files" : "Patent search"}</span>
                  <span>{draft.last_draft_step ?? "Basics"}</span>
                  <span className="text-right text-muted-foreground">{formatDate(draft.updated_at)}</span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="p-6">
              <p className="text-sm text-muted-foreground">No drafts saved yet.</p>
            </div>
          )}
        </CardContent>
      </Card>
      <PaginationNav
        currentPage={Math.min(Math.max(1, page || 1), totalPages)}
        totalPages={totalPages}
        buildHref={buildPageHref}
      />
    </div>
  );
}

function buildPageHref(page: number) {
  return `/requester/drafts?page=${page}`;
}
