import { Badge } from "@/components/ui/badge";

export function formatCurrency(amount?: number | string | null, currency = "USD") {
  const numericAmount = Number(amount ?? 0);

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number.isFinite(numericAmount) ? numericAmount : 0);
}

export function formatDate(value?: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

export function titleCaseStatus(value?: string | null) {
  if (!value) {
    return "Unknown";
  }

  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function StatusBadge({ status }: { status?: string | null }) {
  const variant =
    status === "rejected" || status === "closed" ? "destructive" : "secondary";

  return <Badge variant={variant}>{titleCaseStatus(status)}</Badge>;
}
