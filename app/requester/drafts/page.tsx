import { Suspense } from "react";

import { PaginationNav } from "@/components/ui/pagination";
import { RequestListEmptyState } from "@/features/requests/components/request-list-empty-state";
import {
  RequestListRow,
  RequestListTable,
} from "@/features/requests/components/request-list-table";
import { DraftFilterForm } from "@/features/requester/components/draft-filter-form";
import {
  RequestChannelBadge,
  RequestServiceBadge,
} from "@/features/requester/components/request-summary-badges";
import { RequesterHeader } from "@/features/requester/components/requester-header";
import { formatDate } from "@/features/requester/format";
import { getRequesterDrafts } from "@/features/requester/queries";
import { buildFreshRequestHref } from "@/features/requester/requester-routes";
import type { WizardPayload } from "@/features/requester/wizard-types";

type DraftListItem = Awaited<ReturnType<typeof getRequesterDrafts>>["drafts"][number];
type DraftSearchParams = {
  channel?: string;
  service?: string;
  step?: string;
  q?: string;
  page?: string;
};

const draftGridClassName =
  "grid grid-cols-[minmax(17rem,1.4fr)_minmax(8rem,0.8fr)_minmax(12rem,1fr)_minmax(8rem,0.8fr)_minmax(9rem,0.75fr)]";

export default function RequesterDraftsPage({
  searchParams,
}: {
  searchParams: Promise<DraftSearchParams>;
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
  searchParams: Promise<DraftSearchParams>;
}) {
  const params = await searchParams;
  const page = Number(params.page ?? "1");
  const {
    organization,
    drafts,
    totalCount,
    totalPages,
    page: currentPage,
    dictionaries,
  } = await getRequesterDrafts({
    channel: params.channel,
    service: params.service,
    step: params.step,
    q: params.q,
    page: Number.isFinite(page) ? page : 1,
  });

  if (!organization) {
    return <RequesterHeader title="My drafts" description="Create a requester workspace from the dashboard first." />;
  }

  const channelOptions = withUploadChannel(dictionaries?.channels ?? []);

  return (
    <div className="flex h-full min-h-0 flex-col gap-6 overflow-hidden">
      <RequesterHeader title="My drafts" description="Find a saved draft and continue the request wizard." />
      <DraftFilterForm
        channels={channelOptions}
        services={dictionaries?.serviceTypes ?? []}
        channel={params.channel}
        service={params.service}
        step={params.step}
        query={params.q}
      />
      <div className="shrink-0 flex items-center justify-between text-sm text-muted-foreground">
        <span>{totalCount} drafts found</span>
        <span>Page {currentPage} of {totalPages}</span>
      </div>
      <RequestListTable
        columns={[
          "Matter / Request No.",
          "Channel",
          "Service",
          "Resume from",
          <span key="updated" className="block text-right">Updated</span>,
        ]}
        gridClassName={draftGridClassName}
        minWidthClassName="min-w-[900px]"
        hasRows={drafts.length > 0}
        emptyState={(
          <RequestListEmptyState
            actionHref={buildFreshRequestHref()}
            title="No drafts found"
            description="No drafts match the current filters. Reset the filters or create a new request."
          />
        )}
      >
        {drafts.map((draft) => {
          const payload = draftPayload(draft);
          const channelCode = draftChannelCode(draft);

          return (
            <RequestListRow
              key={draft.id}
              href={`/requester/drafts/${draft.id}`}
              gridClassName={draftGridClassName}
            >
              <span className="min-w-0">
                <strong className="block truncate text-base text-foreground">
                  {draftMatter(draft)}
                </strong>
                <span className="mt-1 block truncate text-xs text-muted-foreground">
                  {draft.request_no}
                </span>
              </span>
              <span className="min-w-0">
                <RequestChannelBadge
                  channelCode={channelCode}
                  label={dictionaryLabel(channelOptions, channelCode)}
                  variant="neutral"
                />
              </span>
              <span className="min-w-0">
                <RequestServiceBadge
                  serviceTypes={payload?.config?.serviceTypes ?? []}
                  serviceOptions={dictionaries?.serviceTypes ?? []}
                />
              </span>
              <span>{normalizeDraftStep(payload?.lastStep ?? draft.last_draft_step)}</span>
              <span className="whitespace-nowrap text-right text-muted-foreground">
                {formatDate(draft.updated_at)}
              </span>
            </RequestListRow>
          );
        })}
      </RequestListTable>
      <div className="shrink-0 pt-2">
        <PaginationNav
          currentPage={currentPage}
          totalPages={totalPages}
          buildHref={(pageNumber) => buildPageHref(pageNumber, params)}
        />
      </div>
    </div>
  );
}

function buildPageHref(page: number, filters: DraftSearchParams) {
  const searchParams = new URLSearchParams();

  for (const key of ["channel", "service", "step", "q"] as const) {
    const value = filters[key]?.trim();
    if (value && value !== "all") {
      searchParams.set(key, value);
    }
  }
  searchParams.set("page", String(page));

  return `/requester/drafts?${searchParams.toString()}`;
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

  const files = payload?.uploadedFiles ?? [];
  if (files.length === 1) {
    return files[0].name;
  }
  return files.length ? `${files.length} uploaded files` : draft.request_no;
}

function draftChannelCode(draft: DraftListItem) {
  if (draft.source_mode === "upload") return "upload_files";
  return draftPayload(draft)?.config?.channelCode ?? "";
}

function normalizeDraftStep(step?: string | null) {
  if (!step || ["Basics", "Parse", "Patent Detail"].includes(step)) {
    return "Source";
  }
  return step;
}

function withUploadChannel(options: Array<{ value: string; label: string }>) {
  return options.some((option) => option.value === "upload_files")
    ? options
    : [...options, { value: "upload_files", label: "Upload Files" }];
}

function dictionaryLabel(
  options: Array<{ value: string; label: string }>,
  value?: string | null,
) {
  if (!value) return "-";
  return options.find((option) => option.value === value)?.label ?? value;
}
