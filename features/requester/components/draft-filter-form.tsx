import { RequestListFilterForm } from "@/features/requests/components/request-list-filter-form";

export function DraftFilterForm({
  channel,
  service,
  channels,
  services,
  query,
}: {
  channel?: string;
  service?: string;
  channels: Array<{ value: string; label: string }>;
  services: Array<{ value: string; label: string }>;
  query?: string;
}) {
  return (
    <RequestListFilterForm
      basePath="/requester/drafts"
      query={query}
      searchPlaceholder="Search draft, patent or file"
      className="xl:grid-cols-[minmax(18rem,1.6fr)_minmax(10rem,0.85fr)_minmax(10rem,0.85fr)_auto]"
      filters={[
        {
          name: "channel",
          value: channel,
          placeholder: "All channels",
          options: [{ value: "all", label: "All channels" }, ...channels],
        },
        {
          name: "service",
          value: service,
          placeholder: "All services",
          options: [{ value: "all", label: "All services" }, ...services],
        },
      ]}
    />
  );
}
