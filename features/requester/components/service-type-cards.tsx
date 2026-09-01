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

const serviceTypeDetails: Record<ServiceTypeSelectionValue, {
  timing: string;
  trigger: string;
  description: string;
}> = {
  ep_granting: {
    timing: "4 months",
    trigger: "Rule 71(3)",
    description: "Choose the target language and provide the verified TIFG clean copy before generating a quote.",
  },
  ep_validation: {
    timing: "3 months",
    trigger: "Grant publication",
    description: "Select the required validation service items and target countries for the granted EP patent.",
  },
  unitary_patent: {
    timing: "1 month",
    trigger: "Grant publication",
    description: "Choose the Unitary Patent service for the granted EP patent before its filing deadline.",
  },
  traditional_validation_unitary_patent:
    {
      timing: "1 / 3 months",
      trigger: "Earliest deadline applies",
      description: "Combine Traditional Validation and Unitary Patent services; the earlier deadline applies.",
    },
  pct_national_phase: {
    timing: "30 / 31 months",
    trigger: "PCT filing or priority date",
    description: "Choose the national-phase filing service for the selected jurisdiction.",
  },
  pct_national_phase_translation: {
    timing: "30 / 31 months",
    trigger: "PCT filing or priority date",
    description: "Combine national-phase filing with the translation service required by the selected jurisdiction.",
  },
  paris_direct_filing: {
    timing: "12 months",
    trigger: "Earliest priority date",
    description: "Choose direct filing under the Paris Convention for the selected jurisdiction.",
  },
  paris_direct_filing_translation: {
    timing: "12 months",
    trigger: "Earliest priority date",
    description: "Combine direct filing under the Paris Convention with translation.",
  },
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
  const selectedDetail = selectedOption
    ? serviceTypeDetails[selectedOption.value]
    : undefined;
  const selectedAvailability = selectedOption
    ? props.availability?.[selectedOption.value]
    : undefined;

  return (
    <Field label="Service Type" required>
      <TooltipProvider delayDuration={120}>
        <div
          role="radiogroup"
          aria-invalid={Boolean(props.error)}
          aria-required="true"
          className="grid grid-cols-4 gap-3"
        >
          {getServiceTypeSelections(props.channelCode).map((option) => {
            const availability = props.availability?.[option.value];
            const disabled = availability?.available === false;
            const selected = selectedOption?.value === option.value;
            return (
              <div
                key={option.value}
                className={`relative min-w-0 rounded-xl border transition-all duration-200 ${
                  disabled && !selected
                    ? "cursor-not-allowed border-border"
                    : selected
                      ? "border-brand-border bg-brand-soft shadow-sm"
                      : "border-border hover:border-brand/50"
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
                  className={`flex min-h-[96px] w-full flex-col items-start justify-start rounded-xl px-3 py-3 text-left transition-colors ${
                    disabled && !selected
                      ? "cursor-not-allowed text-muted-foreground opacity-70"
                      : selected
                        ? "text-brand-soft-foreground"
                        : "text-foreground"
                  }`}
                >
                  <span className="flex w-full items-start gap-3">
                    <span
                      aria-hidden="true"
                      className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border ${
                        selected
                          ? "border-brand bg-brand"
                          : "border-muted-foreground/70"
                      }`}
                    >
                      {selected ? <span className="size-2 rounded-full bg-brand-foreground" /> : null}
                    </span>
                    <span className="min-w-0 text-sm font-semibold leading-5">
                      {option.label}
                    </span>
                  </span>
                  <span className="mt-2 pl-8 text-xs leading-5 text-muted-foreground">
                    <strong className={`font-semibold ${selected ? "text-brand-soft-foreground" : "text-foreground"}`}>
                      {serviceTypeDetails[option.value].timing}
                    </strong>
                    {` · ${serviceTypeDetails[option.value].trigger}`}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      </TooltipProvider>
      {selectedOption && selectedDetail ? (
        <div className="grid gap-2 border-l-2 border-brand bg-brand-soft/50 px-4 py-3 text-sm text-foreground md:grid-cols-[max-content_minmax(0,1fr)_auto] md:items-center">
          <span className="font-semibold whitespace-nowrap">{selectedOption.label}</span>
          <span className="text-xs leading-5 text-muted-foreground">
            {selectedDetail.description}
          </span>
          <span className="font-semibold whitespace-nowrap">
            Deadline: {selectedAvailability?.deadline ?? "-"}
          </span>
        </div>
      ) : null}
      {props.error ? <p className="text-sm text-destructive">{props.error}</p> : null}
    </Field>
  );
}
