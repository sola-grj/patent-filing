import { RequestListFilterForm } from "@/features/requests/components/request-list-filter-form";
import { requestStatusOptions } from "@/features/requester/options";

export function PmRequestFilterForm({
  channels,
  customers,
  customer,
  channel,
  status,
  query,
}: {
  channels: Array<{ value: string; label: string }>;
  customers: Array<{ value: string; label: string }>;
  customer?: string;
  channel?: string;
  status?: string;
  query?: string;
}) {
  return (
    <RequestListFilterForm
      basePath="/pm"
      query={query}
      searchPlaceholder="Search request, patent or matter"
      className="lg:grid-cols-[minmax(20rem,2fr)_minmax(11rem,0.85fr)_minmax(11rem,0.85fr)_minmax(12rem,0.95fr)_auto]"
      filters={[
        {
          name: "status",
          value: status,
          placeholder: "All lifecycles",
          options: requestStatusOptions,
        },
        {
          name: "channel",
          value: channel,
          placeholder: "All channels",
          options: [{ value: "all", label: "All channels" }, ...channels],
        },
        {
          name: "customer",
          value: customer,
          placeholder: "All customers",
          options: [{ value: "all", label: "All customers" }, ...customers],
        },
      ]}
    />
  );
}
