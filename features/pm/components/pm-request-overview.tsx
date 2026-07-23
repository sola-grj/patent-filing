import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/features/requester/format";
import {
  channelOptions,
  entityTypeOptions,
  epvTypeOptions,
  filingApplicationTypeOptions,
  filingTypeOptions,
  jurisdictionOptions,
  purposeOptions,
  qualityOptions,
  serviceTypeOptions,
  sourceLanguageOptions,
} from "@/features/requester/options";
import type { WizardConfig } from "@/features/requester/wizard-types";

export function PmRequestOverview({
  config,
  organizationName,
  request,
}: {
  config: WizardConfig;
  organizationName: string;
  request: {
    channel_code?: string | null;
    submitted_at?: string | null;
    updated_at?: string | null;
  };
}) {
  const serviceTypes = config.serviceTypes ?? [];
  const showFilingFields = serviceTypes.includes("filing");
  const showEpvType = serviceTypes.includes("epv");
  const showQuality = serviceTypes.includes("translation") || showEpvType;
  const showDueDate = serviceTypes.includes("translation") && Boolean(config.dueAt);
  const items = [
    { label: "Organization", value: organizationName },
    { label: "Submitted", value: formatDate(request.submitted_at) },
    { label: "Updated", value: formatDate(request.updated_at) },
    {
      label: "Channel",
      value: channelLabel(config.channelCode || request.channel_code),
    },
    { label: "Service type", value: labelForMany(serviceTypeOptions, serviceTypes) },
    { label: "Patent language", value: labelFor(sourceLanguageOptions, config.sourceLanguage) },
    {
      label: "Jurisdictions",
      value: labelForMany(jurisdictionOptions, config.jurisdictionCodes),
    },
    { label: "Purpose", value: labelFor(purposeOptions, config.purpose) },
    ...(showQuality
      ? [{ label: "Quality", value: labelFor(qualityOptions, config.qualityLevel) }]
      : []),
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
    ...(showEpvType
      ? [{ label: "EPV type", value: labelFor(epvTypeOptions, config.epvType) }]
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
        <CardTitle>Request overview</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-x-10 gap-y-6 md:grid-cols-2">
          {items.map((item) => (
            <div key={item.label} className={item.wide ? "md:col-span-2" : undefined}>
              <dt className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
                {item.label}
              </dt>
              <dd className="mt-2 break-words text-sm leading-6">{item.value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

function labelFor(
  options: Array<{ value: string; label: string }>,
  value?: string | null,
) {
  if (!value) return "-";
  return options.find((option) => option.value === value)?.label ?? value;
}

function channelLabel(value?: string | null) {
  return value === "ep" ? "EPO" : labelFor(channelOptions, value);
}

function labelForMany(
  options: Array<{ value: string; label: string }>,
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
