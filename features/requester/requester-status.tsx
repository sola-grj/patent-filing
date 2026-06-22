import {
  CircleCheck,
  CircleHelp,
  CircleX,
  Clock3,
  MessageSquare,
  Scale,
  type LucideIcon,
} from "lucide-react";

import {
  StatusPill,
  type StatusPillProps,
} from "@/components/ui/status-pill";

import { titleCaseStatus } from "./format";

export type RequesterLifecycleStatus =
  | "responding"
  | "negotiation"
  | "in_progress"
  | "rejected"
  | "completed";

type RequesterStatusMeta = {
  icon: LucideIcon;
  label: string;
  toneClassName: string;
};

const neutralStatusMeta: RequesterStatusMeta = {
  icon: CircleHelp,
  label: "Unknown",
  toneClassName: "border-slate-200 bg-slate-50 text-slate-700",
};

const requesterStatusMetaMap: Record<
  RequesterLifecycleStatus,
  RequesterStatusMeta
> = {
  responding: {
    icon: MessageSquare,
    label: "Responding",
    toneClassName: "border-cyan-200 bg-cyan-50 text-cyan-700",
  },
  negotiation: {
    icon: Scale,
    label: "Negotiating",
    toneClassName: "border-amber-200 bg-amber-50 text-amber-700",
  },
  in_progress: {
    icon: Clock3,
    label: "In progress",
    toneClassName: "border-violet-200 bg-violet-50 text-violet-700",
  },
  rejected: {
    icon: CircleX,
    label: "Rejected",
    toneClassName: "border-red-200 bg-red-50 text-red-700",
  },
  completed: {
    icon: CircleCheck,
    label: "Completed",
    toneClassName: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
};

export function getRequesterStatusMeta(status?: string | null) {
  if (!status) {
    return neutralStatusMeta;
  }

  return (
    requesterStatusMetaMap[status as RequesterLifecycleStatus] ?? {
      ...neutralStatusMeta,
      label: titleCaseStatus(status),
    }
  );
}

export function RequesterStatusBadge({
  status,
  size,
  className,
  ...props
}: Omit<StatusPillProps, "icon" | "label" | "toneClassName"> & {
  status?: string | null;
}) {
  const meta = getRequesterStatusMeta(status);

  return (
    <StatusPill
      className={className}
      icon={meta.icon}
      label={meta.label}
      size={size}
      toneClassName={meta.toneClassName}
      {...props}
    />
  );
}
