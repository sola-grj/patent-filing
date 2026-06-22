import type { HTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const statusPillVariants = cva(
  "inline-flex items-center justify-center rounded-full border font-medium",
  {
    variants: {
      size: {
        default: "h-7 w-40 gap-1.5 px-2.5 text-xs [&_svg]:size-3.5",
        compact: "h-6 w-36 gap-1.5 px-2 text-[11px] [&_svg]:size-3.5",
      },
    },
    defaultVariants: {
      size: "default",
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
  toneClassName,
  ...props
}: StatusPillProps) {
  return (
    <div
      className={cn(
        statusPillVariants({ size }),
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
