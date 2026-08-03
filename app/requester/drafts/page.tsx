import Link from "next/link";
import { Suspense } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { PaginationNav } from "@/components/ui/pagination";
import { RequesterHeader } from "@/features/requester/components/requester-header";
import { formatDate } from "@/features/requester/format";
import { getRequesterDrafts } from "@/features/requester/queries";
import type { WizardPayload } from "@/features/requester/wizard-types";

type DraftListItem = Awaited<ReturnType<typeof getRequesterDrafts>>["drafts"][number];

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
    <div className="flex h-full min-h-0 flex-col gap-6 overflow-hidden">
      <RequesterHeader title="My drafts" description="Drafts do not have a detail page. Open one to continue editing the request wizard." />
      <div className="shrink-0 flex items-center justify-between text-sm text-muted-foreground">
        <span>{totalCount} drafts found</span>
        <span>Page {Math.min(Math.max(1, page || 1), totalPages)} of {totalPages}</span>
      </div>
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <CardContent className="min-h-0 flex-1 overflow-y-auto p-0">
          {drafts.length ? (
            <div>
              <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(7rem,0.8fr)_minmax(0,1fr)_minmax(7rem,0.8fr)_8rem] gap-4 border-b bg-muted/50 px-4 py-3 text-xs font-medium text-muted-foreground md:grid">
                <span>Matter</span>
                <span>Channel</span>
                <span>Service</span>
                <span>Resume from</span>
                <span className="text-right">Updated</span>
              </div>
              <div className="divide-y">
                {drafts.map((draft) => (
                  <Link
                    key={draft.id}
                    href={`/requester/drafts/${draft.id}`}
                    className="grid gap-3 p-4 text-sm hover:bg-muted/50 md:grid-cols-[minmax(0,1.4fr)_minmax(7rem,0.8fr)_minmax(0,1fr)_minmax(7rem,0.8fr)_8rem] md:items-center md:gap-4"
                  >
                    <span className="min-w-0">
                      <strong className="block truncate">{draftMatter(draft)}</strong>
                      <span className="block truncate text-xs text-muted-foreground">
                        {draft.request_no}
                      </span>
                    </span>
                    <span>{draftChannel(draft)}</span>
                    <span className="truncate">{draftServices(draft)}</span>
                    <span>{draft.last_draft_step ?? "Source"}</span>
                    <span className="text-right text-muted-foreground">{formatDate(draft.updated_at)}</span>
                  </Link>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-6">
              <p className="text-sm text-muted-foreground">No drafts saved yet.</p>
            </div>
          )}
        </CardContent>
      </Card>
      <div className="shrink-0 pt-2">
        <PaginationNav
          currentPage={Math.min(Math.max(1, page || 1), totalPages)}
          totalPages={totalPages}
          buildHref={buildPageHref}
        />
      </div>
    </div>
  );
}

function buildPageHref(page: number) {
  return `/requester/drafts?page=${page}`;
}

function draftPayload(draft: DraftListItem) {
  return draft.draft_payload as Partial<WizardPayload> | null;
}

function draftMatter(draft: DraftListItem) {
  const payload = draftPayload(draft);
  if (payload?.sourceMode === "patent_search") {
    return payload.selectedPatent?.patentNumber
      || payload.patentQuery
      || draft.request_no;
  }

  const fileCount = payload?.uploadedFiles?.length ?? 0;
  return fileCount
    ? `${fileCount} uploaded file${fileCount === 1 ? "" : "s"}`
    : draft.request_no;
}

function draftChannel(draft: DraftListItem) {
  if (draft.source_mode === "upload") return "Upload Files";
  const channelLabels: Record<string, string> = {
    ep: "EPO",
    pct: "PCT",
    paris_convention: "Paris Convention",
  };
  const channelCode = draftPayload(draft)?.config?.channelCode ?? "";
  return channelLabels[channelCode] ?? "-";
}

function draftServices(draft: DraftListItem) {
  const serviceLabels: Record<string, string> = {
    translation: "Translation",
    filing: "Filing",
    european_patent_grant_registration: "European Patent Grant Registration",
    epv: "EPV",
  };
  const services = draftPayload(draft)?.config?.serviceTypes ?? [];
  return services.length
    ? services.map((service) => serviceLabels[service] ?? service).join(", ")
    : "Not configured";
}
