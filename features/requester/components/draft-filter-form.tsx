import { RequestListFilterForm } from "@/features/requests/components/request-list-filter-form";

const draftStepOptions = [
  { value: "all", label: "All steps" },
  { value: "Source", label: "Source" },
  { value: "Configure", label: "Configure" },
  { value: "Quote", label: "Quote" },
];

export function DraftFilterForm({
  channel,
  service,
  step,
  channels,
  services,
  query,
}: {
  channel?: string;
  service?: string;
  step?: string;
  channels: Array<{ value: string; label: string }>;
  services: Array<{ value: string; label: string }>;
  query?: string;
}) {
  return (
    <RequestListFilterForm
      basePath="/requester/drafts"
      query={query}
      searchPlaceholder="Search draft, patent or file"
      className="xl:grid-cols-[minmax(18rem,1.6fr)_minmax(10rem,0.85fr)_minmax(10rem,0.85fr)_minmax(10rem,0.85fr)_auto]"
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
        {
          name: "step",
          value: step,
          placeholder: "All steps",
          options: draftStepOptions,
        },
      ]}
    />
  );
}
