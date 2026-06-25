import type { HTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const statusPillVariants = cva(
  "inline-flex items-center justify-center rounded-full border font-medium",
  {
    variants: {
      size: {
        default: "h-7 gap-1.5 px-2.5 text-xs [&_svg]:size-3.5",
        compact: "h-6 gap-1 px-1.5 text-[11px] [&_svg]:size-3",
      },
      width: {
        fixed: "w-40",
        compactFixed: "w-28",
        full: "w-full",
      },
    },
    defaultVariants: {
      size: "default",
      width: "fixed",
    },
  },
);

export interface StatusPillProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof statusPillVariants> {
  icon?: LucideIcon;
  label: string;
  toneClassName?: string;
}

export function StatusPill({
  className,
  icon: Icon,
  label,
  size,
  width,
  toneClassName,
  ...props
}: StatusPillProps) {
  return (
    <div
      className={cn(
        statusPillVariants({
          size,
          width: width ?? (size === "compact" ? "compactFixed" : "fixed"),
        }),
        "whitespace-nowrap",
        toneClassName,
        className,
      )}
      {...props}
    >
      {Icon ? <Icon aria-hidden="true" /> : null}
      <span>{label}</span>
    </div>
  );
}
