import { AlertTriangle } from "lucide-react";

export function PatentCacheWarning() {
  return (
    <div
      role="status"
      className="flex gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <p>
        Official source returned no result. Cached patent data is shown and may
        be outdated. Please review it carefully.
      </p>
    </div>
  );
}
