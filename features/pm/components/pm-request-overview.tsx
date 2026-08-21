import { ClipboardList } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RequestDeadlinePanel } from "@/features/requester/components/request-deadline-panel";
import type { DashboardDeadlineItem } from "@/features/requester/deadlines";
import { formatDate } from "@/features/requester/format";
import {
  channelOptions,
  entityTypeOptions,
  filingApplicationTypeOptions,
  filingTypeOptions,
  jurisdictionOptions,
  mockUnitaryTargetLanguageOptions,
  serviceTypeOptions,
  sourceLanguageOptions,
  traditionalServiceItemOptions,
} from "@/features/requester/options";
import {
  isTraditionalValidation,
  requiresEpCountries,
  resolveServiceTypeSelection,
} from "@/features/requester/request-paths";
import type { WizardConfig } from "@/features/requester/wizard-types";
import type { ReactNode } from "react";

export function PmRequestOverview({
  config,
  epCountries,
  deadlineItems,
  deadlinePendingMessage,
  organizationName,
  request,
}: {
  config: WizardConfig;
  epCountries: Array<{ id: number; name: string }>;
  deadlineItems: DashboardDeadlineItem[];
  deadlinePendingMessage?: string | null;
  organizationName: string;
  request: {
    channel_code?: string | null;
    submitted_at?: string | null;
    updated_at?: string | null;
  };
}) {
  const serviceTypes = config.serviceTypes ?? [];
  const showFilingFields = serviceTypes.includes("filing");
  const showServiceItem = isTraditionalValidation(config.epServiceType);
  const showDestinations = config.channelCode !== "ep"
    || requiresEpCountries(config.epServiceType);
  const serviceTypeLabel = resolveServiceTypeSelection(
    config.channelCode,
    serviceTypes,
    config.epvType,
    config.epServiceType,
  )?.label ?? labelForMany(serviceTypeOptions, serviceTypes);
  const showDueDate = serviceTypes.includes("translation") && Boolean(config.dueAt);
  const items: Array<{ label: string; value: ReactNode; wide?: boolean }> = [
    { label: "Organization", value: organizationName },
    { label: "Submitted", value: formatDate(request.submitted_at) },
    { label: "Updated", value: formatDate(request.updated_at) },
    {
      label: "Route",
      value: channelLabel(config.channelCode || request.channel_code),
    },
    { label: "Service type", value: serviceTypeLabel },
    { label: "Translation", value: config.translationRequired ? "Required" : "Not required" },
    { label: "Source Language", value: labelFor(sourceLanguageOptions, config.sourceLanguage) },
    ...(config.targetLanguages.length ? [{
      label: "Target language(s)",
      value: labelForMany(
        [...sourceLanguageOptions, ...mockUnitaryTargetLanguageOptions],
        config.targetLanguages,
      ),
    }] : []),
    ...(showDestinations ? [{
      label: config.epCountryIds.length ? "EP countries" : "Jurisdictions",
      value: config.epCountryIds.length
        ? config.epCountryIds.map((id) =>
            epCountries.find((country) => country.id === id)?.name ?? `EP country ${id}`,
          ).join(", ") || "-"
        : labelForMany(jurisdictionOptions, config.jurisdictionCodes),
    }] : []),
    ...(config.optOutCountryIds.length ? [{
      label: "Opt Out countries",
      value: config.optOutCountryIds.map((id) =>
        epCountries.find((country) => country.id === id)?.name ?? `EP country ${id}`,
      ).join(", "),
    }] : []),
    { label: "Delivery option", value: titleCase(config.deliveryOption) },
    ...(showFilingFields
      ? [
          { label: "Filing type", value: labelFor(filingTypeOptions, config.filingType) },
          {
            label: "Application type",
            value: labelFor(filingApplicationTypeOptions, config.filingApplicationType),
          },
          { label: "Entity type", value: labelFor(entityTypeOptions, config.entityType) },
        ]
      : []),
    ...(showServiceItem
      ? [{
          label: "Service Item",
          value: labelFor(traditionalServiceItemOptions, config.serviceItem),
        }]
      : []),
    ...(showDueDate
      ? [{ label: "Due date", value: formatDate(config.dueAt) }]
      : []),
    { label: "Urgent", value: config.isUrgent ? "Yes" : "No" },
    {
      label: "Special requirements",
      value: config.customScope?.trim() || "-",
      wide: true,
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardList className="size-5" />
          Request overview
        </CardTitle>
      </CardHeader>
      <CardContent>
        {deadlineItems.length || deadlinePendingMessage ? (
          <RequestDeadlinePanel
            items={deadlineItems}
            pendingMessage={deadlinePendingMessage}
          />
        ) : null}
        <section
          aria-label="Basic info"
          className={`rounded-lg border border-border/70 bg-background p-4 ${deadlineItems.length || deadlinePendingMessage ? "mt-6" : ""}`}
        >
          <h3 className="text-sm font-semibold">Basic info</h3>
          <dl className="mt-4 grid gap-x-10 gap-y-6 md:grid-cols-2">
            {items.map((item) => (
              <div key={item.label} className={item.wide ? "md:col-span-2" : undefined}>
                <dt className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
                  {item.label}
                </dt>
                <dd className="mt-2 break-words text-sm leading-6">{item.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      </CardContent>
    </Card>
  );
}

function labelFor(
  options: readonly { value: string; label: string }[],
  value?: string | null,
) {
  if (!value) return "-";
  return options.find((option) => option.value === value)?.label ?? value;
}

function channelLabel(value?: string | null) {
  return value === "ep" ? "EPO" : labelFor(channelOptions, value);
}

function labelForMany(
  options: readonly { value: string; label: string }[],
  values?: string[] | null,
) {
  if (!values?.length) return "-";
  return values.map((value) => labelFor(options, value)).join(", ");
}

function titleCase(value?: string | null) {
  if (!value) return "-";
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
