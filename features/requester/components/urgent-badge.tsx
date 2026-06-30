import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function UrgentBadge({ className }: { className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn("border-rose-200 bg-rose-50 text-rose-700", className)}
    >
      Urgent
    </Badge>
  );
}
