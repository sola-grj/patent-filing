import { RequestListFilterForm } from "@/features/requests/components/request-list-filter-form";
import { requestStatusOptions } from "@/features/requester/options";

export function RequestFilterForm({
  status,
  channel,
  channels,
  query,
}: {
  status?: string;
  channel?: string;
  channels: Array<{ value: string; label: string }>;
  query?: string;
}) {
  return (
    <RequestListFilterForm
      basePath="/requester/requests"
      query={query}
      searchPlaceholder="Search request, patent or matter"
      className="lg:grid-cols-[minmax(20rem,2fr)_minmax(12rem,0.95fr)_minmax(12rem,0.95fr)_auto]"
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
      ]}
    />
  );
}
