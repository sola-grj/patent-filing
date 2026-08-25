"use client";

import { Info } from "lucide-react";
import { useEffect } from "react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { EpoServiceAvailability } from "@/features/requester/deadlines";
import {
  getDefaultServiceTypeSelection,
  getServiceTypeSelections,
  resolveServiceTypeSelection,
  type ServiceTypeSelectionValue,
} from "@/features/requester/request-paths";
import { Field } from "./new-request-wizard-shared";

const cardStyles: Partial<Record<ServiceTypeSelectionValue, string>> = {
  ep_granting: "bg-[linear-gradient(135deg,#d946ef,#ec4899)] text-white",
  ep_validation: "bg-[linear-gradient(135deg,#1d4ed8,#1e3a8a)] text-white",
  unitary_patent: "bg-[linear-gradient(135deg,#0f766e,#14b8a6)] text-white",
  traditional_validation_unitary_patent:
    "bg-[linear-gradient(135deg,#3f3f46,#52525b)] text-white",
};

export function ServiceTypeCards(props: {
  channelCode: string;
  error?: string;
  value: string[];
  onChange: (serviceType: ServiceTypeSelectionValue) => void;
  epvType?: string;
  epServiceType?: string;
  availability?: Partial<Record<ServiceTypeSelectionValue, EpoServiceAvailability>>;
}) {
  const onChange = props.onChange;
  const selectedOption = resolveServiceTypeSelection(
    props.channelCode,
    props.value,
    props.epvType,
    props.epServiceType,
  );
  const defaultOption = getDefaultServiceTypeSelection(
    props.channelCode,
    props.value,
    props.epvType,
    props.epServiceType,
    (option) => props.availability?.[option.value]?.available !== false,
  );

  useEffect(() => {
    if (!defaultOption) return;
    onChange(defaultOption.value);
  }, [defaultOption, onChange]);

  return (
    <Field label="Service Type" required>
      <TooltipProvider delayDuration={120}>
        <div
          role="radiogroup"
          aria-invalid={Boolean(props.error)}
          aria-required="true"
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
        >
          {getServiceTypeSelections(props.channelCode).map((option) => {
            const availability = props.availability?.[option.value];
            const disabled = availability?.available === false;
            const selected = selectedOption?.value === option.value;
            return (
              <div
                key={option.value}
                className={`relative rounded-[22px] border p-1 transition-all duration-200 ${
                  disabled
                    ? "cursor-not-allowed border-border bg-muted/40"
                    : selected
                      ? "border-[#64748b] bg-[#64748b] shadow-[0_18px_44px_rgba(15,23,42,0.16)]"
                      : "border-border hover:border-foreground/15 hover:shadow-[0_10px_24px_rgba(15,23,42,0.08)]"
                }`}
              >
                {disabled && availability?.reason ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label={`Why ${option.label} is unavailable`}
                        className="absolute right-3 top-3 z-10 inline-flex size-7 items-center justify-center rounded-full border bg-background/90 text-muted-foreground shadow-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <Info className="size-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-72 text-center">
                      {availability.reason}
                    </TooltipContent>
                  </Tooltip>
                ) : null}
                <button
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={disabled}
                  onClick={() => props.onChange(option.value)}
                  className={`flex min-h-[124px] w-full flex-col items-center justify-center rounded-[18px] px-5 py-7 text-center transition-all duration-200 ${
                    disabled
                      ? "cursor-not-allowed bg-muted text-muted-foreground opacity-70"
                      : cardStyles[option.value]
                        ?? "bg-[linear-gradient(135deg,#334155,#475569)] text-white"
                  } ${selected && !disabled
                    ? "shadow-[inset_0_0_0_1px_rgba(255,255,255,0.92)]"
                    : ""}`}
                >
                  <span className="text-base font-semibold leading-snug tracking-[-0.02em]">
                    {option.label}
                  </span>
                  {!disabled && availability?.deadline ? (
                    <span className="mt-2 text-xs opacity-80">
                      Available until {availability.deadline}
                    </span>
                  ) : null}
                </button>
              </div>
            );
          })}
        </div>
      </TooltipProvider>
      {props.error ? <p className="text-sm text-destructive">{props.error}</p> : null}
    </Field>
  );
}
