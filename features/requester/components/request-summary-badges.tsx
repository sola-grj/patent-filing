import { RequesterStatusBadge } from "@/features/requester/requester-status";

const channelToneClassNames: Record<string, string> = {
  ep: "border-fuchsia-400 bg-[linear-gradient(135deg,#d946ef,#ec4899)] text-white",
  pct: "border-blue-700 bg-[linear-gradient(135deg,#1d4ed8,#1e3a8a)] text-white",
  paris_convention: "border-teal-600 bg-[linear-gradient(135deg,#0f766e,#14b8a6)] text-white",
  upload_files: "border-zinc-600 bg-[linear-gradient(135deg,#3f3f46,#52525b)] text-white",
};

export function RequestSummaryBadges({
  channelCode,
  channelLabel,
  serviceTypes,
  serviceOptions,
  status,
}: {
  channelCode?: string | null;
  channelLabel: string;
  serviceTypes: string[];
  serviceOptions: Array<{ value: string; label: string }>;
  status?: string | null;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-center gap-2">
      <span
        className={`rounded-full border px-3 py-1 text-xs font-semibold shadow-sm ${
          channelToneClassNames[channelCode ?? ""]
            ?? "border-slate-300 bg-slate-100 text-slate-700"
        }`}
      >
        {channelLabel}
      </span>
      <span className="rounded-full border bg-background px-3 py-1 text-xs font-medium text-foreground">
        {serviceTypeLabel(serviceTypes, serviceOptions)}
      </span>
      <RequesterStatusBadge status={status} />
    </div>
  );
}

function serviceTypeLabel(
  serviceTypes: string[],
  serviceOptions: Array<{ value: string; label: string }>,
) {
  const normalizedTypes = [...serviceTypes].sort().join("|");
  const labels: Record<string, string> = {
    translation: "Translation",
    european_patent_grant_registration: "Grant",
    filing: "Filing",
    "filing|translation": "Translation + Filing",
    "european_patent_grant_registration|translation": "Translation + Grant",
    epv: "EPV",
  };

  if (labels[normalizedTypes]) {
    return labels[normalizedTypes];
  }

  return serviceTypes.length
    ? serviceTypes
        .map((value) => serviceOptions.find((option) => option.value === value)?.label ?? value)
        .join(" + ")
    : "-";
}
