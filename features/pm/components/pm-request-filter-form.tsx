import { Button } from "@/components/ui/button";

const pmStatusOptions = [
  { value: "all", label: "All lifecycles" },
  { value: "responding", label: "Responding" },
  { value: "negotiation", label: "Negotiating" },
  { value: "in_progress", label: "In progress" },
  { value: "rejected", label: "Rejected" },
  { value: "completed", label: "Completed" },
];

export function PmRequestFilterForm({
  status,
  query,
}: {
  status?: string;
  query?: string;
}) {
  return (
    <form className="flex flex-col gap-3 rounded-md border p-4 md:flex-row">
      <select
        name="status"
        defaultValue={status ?? "all"}
        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
      >
        {pmStatusOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <input
        name="q"
        defaultValue={query ?? ""}
        placeholder="Search request number, patent number, or organization"
        className="h-10 rounded-md border border-input bg-background px-3 text-sm md:flex-1"
      />
      <Button type="submit">Filter</Button>
    </form>
  );
}
