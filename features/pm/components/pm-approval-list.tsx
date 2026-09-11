import { PaginationNav } from "@/components/ui/pagination";
import {
  RequestListRow,
  RequestListTable,
} from "@/features/requests/components/request-list-table";

type Relation<T> = T | T[] | null;

type Approval = {
  id: string;
  approval_type: string;
  status: string;
  sent_at?: string | null;
  submitted_at: string;
  request_id: string;
  submitter?: { display_name?: string | null; email?: string | null } | null;
  translation_requests?: Relation<{
    request_no?: string;
    title?: string | null;
    organizations?: Relation<{ name?: string | null }>;
  }>;
};

const gridClassName =
  "grid grid-cols-[minmax(16rem,1.4fr)_minmax(12rem,1fr)_minmax(12rem,1fr)_minmax(11rem,0.9fr)_minmax(11rem,0.9fr)_minmax(7rem,0.6fr)]";

export function PmApprovalList({
  items,
  page,
  totalPages,
  totalCount,
  filters,
}: {
  items: Approval[];
  page: number;
  totalPages: number;
  totalCount: number;
  filters: {
    customer?: string;
    pm?: string;
    status?: string;
    q?: string;
  };
}) {
  return (
    <>
      <div className="flex shrink-0 items-center justify-between text-sm text-muted-foreground">
        <span>{totalCount} approvals</span>
        <span>Page {page} of {totalPages}</span>
      </div>
      <RequestListTable
        columns={[
          "Request",
          "Customer",
          "Submitted PM",
          "Approval type",
          "Submitted",
          "Status",
        ]}
        gridClassName={gridClassName}
        minWidthClassName="min-w-[1040px]"
        hasRows={items.length > 0}
        emptyState={
          <div className="flex min-h-48 items-center justify-center text-sm text-muted-foreground">
            No quotation change approvals found.
          </div>
        }
      >
        {items.map((approval) => (
          <ApprovalRow key={approval.id} approval={approval} />
        ))}
      </RequestListTable>
      <div className="shrink-0 pt-1">
        <PaginationNav
          currentPage={page}
          totalPages={totalPages}
          buildHref={(nextPage) => buildPageHref(nextPage, filters)}
        />
      </div>
    </>
  );
}

function ApprovalRow({ approval }: { approval: Approval }) {
  const request = first(approval.translation_requests);
  const organization = first(request?.organizations);

  return (
    <RequestListRow
      href={`/pm/approvals/${approval.id}`}
      gridClassName={gridClassName}
    >
      <span className="min-w-0">
        <span className="block truncate text-base font-semibold text-foreground">
          {request?.request_no ?? "Request"}
        </span>
        <span className="mt-1 block truncate text-xs text-muted-foreground">
          {request?.title || "Quotation change"}
        </span>
      </span>
      <span className="truncate">{organization?.name ?? "-"}</span>
      <span className="truncate">
        {approval.submitter?.display_name || approval.submitter?.email || "Unknown PM"}
      </span>
      <span>Quotation change</span>
      <span className="whitespace-nowrap text-muted-foreground">
        {formatDateTime(approval.submitted_at)}
      </span>
      <span className="w-fit rounded-full border px-3 py-1 text-xs font-medium capitalize">
        {approval.sent_at ? "Sent" : approval.status}
      </span>
    </RequestListRow>
  );
}

function first<T>(value?: Relation<T>) {
  return !value ? null : Array.isArray(value) ? value[0] ?? null : value;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function buildPageHref(
  page: number,
  filters: { customer?: string; pm?: string; status?: string; q?: string },
) {
  const params = new URLSearchParams();
  for (const key of ["customer", "pm", "status", "q"] as const) {
    const value = filters[key]?.trim();
    if (value && value !== "all") params.set(key, value);
  }
  params.set("page", String(page));
  return `/pm/approvals?${params.toString()}`;
}
