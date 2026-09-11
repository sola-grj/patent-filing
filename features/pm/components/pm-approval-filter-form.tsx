import { RequestListFilterForm } from "@/features/requests/components/request-list-filter-form";

const statusOptions = [
  { value: "all", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
  { value: "sent", label: "Sent" },
];

export function PmApprovalFilterForm({
  customers,
  pms,
  customer,
  pm,
  status,
  query,
}: {
  customers: Array<{ value: string; label: string }>;
  pms: Array<{ value: string; label: string }>;
  customer?: string;
  pm?: string;
  status?: string;
  query?: string;
}) {
  return (
    <RequestListFilterForm
      basePath="/pm/approvals"
      query={query}
      searchPlaceholder="Search request or matter"
      className="lg:grid-cols-[minmax(20rem,2fr)_minmax(12rem,1fr)_minmax(12rem,1fr)_minmax(11rem,0.85fr)_auto]"
      filters={[
        {
          name: "customer",
          value: customer,
          placeholder: "All customers",
          options: [{ value: "all", label: "All customers" }, ...customers],
        },
        {
          name: "pm",
          value: pm,
          placeholder: "All PMs",
          options: [{ value: "all", label: "All PMs" }, ...pms],
        },
        {
          name: "status",
          value: status,
          placeholder: "All statuses",
          options: statusOptions,
        },
      ]}
    />
  );
}
