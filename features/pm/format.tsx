import {
  CircleCheck,
  CircleDashed,
  CircleX,
  Clock3,
  FileCheck2,
  MessageSquare,
  type LucideIcon,
} from "lucide-react";

import { StatusPill, type StatusPillProps } from "@/components/ui/status-pill";
import { titleCaseStatus } from "@/features/requester/format";

export type PmWorkflowStage =
  | "configured"
  | "quoted"
  | "negotiation"
  | "order_pending"
  | "production"
  | "completed"
  | "closed";

type StageMeta = {
  icon: LucideIcon;
  label: string;
  toneClassName: string;
};

const fallbackStageMeta: StageMeta = {
  icon: CircleDashed,
  label: "Unknown",
  toneClassName: "border-slate-200 bg-slate-50 text-slate-700",
};

const stageMetaMap: Record<PmWorkflowStage, StageMeta> = {
  configured: {
    icon: FileCheck2,
    label: "Ready for quote",
    toneClassName: "border-cyan-200 bg-cyan-50 text-cyan-700",
  },
  quoted: {
    icon: MessageSquare,
    label: "Quote sent",
    toneClassName: "border-blue-200 bg-blue-50 text-blue-700",
  },
  negotiation: {
    icon: MessageSquare,
    label: "Negotiation",
    toneClassName: "border-amber-200 bg-amber-50 text-amber-700",
  },
  order_pending: {
    icon: Clock3,
    label: "Order pending",
    toneClassName: "border-indigo-200 bg-indigo-50 text-indigo-700",
  },
  production: {
    icon: Clock3,
    label: "In production",
    toneClassName: "border-violet-200 bg-violet-50 text-violet-700",
  },
  completed: {
    icon: CircleCheck,
    label: "Completed",
    toneClassName: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  closed: {
    icon: CircleX,
    label: "Closed",
    toneClassName: "border-red-200 bg-red-50 text-red-700",
  },
};

export const pmStageOptions = [
  { value: "all", label: "All stages" },
  { value: "configured", label: "Ready for quote" },
  { value: "negotiation", label: "Negotiation" },
  { value: "order_pending", label: "Order pending" },
  { value: "production", label: "In production" },
  { value: "quoted", label: "Quote sent" },
  { value: "completed", label: "Completed" },
  { value: "closed", label: "Closed" },
];

export function getPmStageMeta(stage?: string | null) {
  if (!stage) {
    return fallbackStageMeta;
  }

  return (
    stageMetaMap[stage as PmWorkflowStage] ?? {
      ...fallbackStageMeta,
      label: titleCaseStatus(stage),
    }
  );
}

export function PmStageBadge({
  stage,
  className,
  size,
  ...props
}: Omit<StatusPillProps, "icon" | "label" | "toneClassName"> & {
  stage?: string | null;
}) {
  const meta = getPmStageMeta(stage);

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
