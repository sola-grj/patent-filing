import { Loader2 } from "lucide-react";

export function RequestLoadingOverlay({
  message = "Loading request wizard...",
}: {
  message?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm">
      <div className="flex min-w-[320px] items-center gap-4 rounded-2xl border bg-card px-6 py-5 shadow-lg">
        <Loader2 className="h-5 w-5 animate-spin text-foreground" />
        <p className="text-sm font-medium text-foreground">{message}</p>
      </div>
    </div>
  );
}
