"use client";

import { ChevronDown } from "lucide-react";
import { useRef, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getTomorrowDateInputValue } from "@/lib/validators/requester";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  channelOptions,
  entityTypeOptions,
  epvTypeOptions,
  filingApplicationTypeOptions,
  filingTypeOptions,
  qualityOptions,
  serviceTypeOptions,
  scopeOptions,
  sourceLanguageOptions,
  targetLanguageOptions,
} from "@/features/requester/options";
import type {
  WizardConfig,
  WizardPayload,
  WizardSourceMode,
} from "@/features/requester/wizard-types";
import {
  onConfigValueChange,
  parsePreviewFiles,
  type WizardConfigFieldErrors,
} from "./new-request-wizard-utils";
import { Field, Metric } from "./new-request-wizard-shared";

export { QuoteStepContent } from "./new-request-quote-step";

export function ParseStep({ payload }: { payload: WizardPayload }) {
  return (
    <ParsePreviewPanel
      payload={payload}
      title="Parse preview"
      description="Mock parser output shown before the request is persisted."
    />
  );
}

export function ParsePreviewPanel({
  payload,
  title,
  description,
  embedded = false,
}: {
  payload: WizardPayload;
  title: string;
  description: string;
  embedded?: boolean;
}) {
  const files = parsePreviewFiles(payload);
  const findings = buildParseFindings(files);
  const metrics = buildParseMetrics(files);

  return (
    <div
      className={
        embedded
          ? "rounded-xl border bg-muted/20 p-5 md:p-6"
          : "flex min-h-0 flex-1 flex-col"
      }
    >
      <div className="shrink-0 space-y-5">
        <div>
          <h3
            className={
              embedded
                ? "text-lg font-semibold tracking-tight"
                : "text-2xl font-semibold tracking-tight"
            }
          >
            {title}
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric title="Files" value={metrics.fileCount} />
          <Metric title="Words" value={metrics.wordCount} />
          <Metric title="Claims" value={metrics.claimCount} />
          <Metric title="Drawings" value={metrics.drawingCount} />
        </div>
      </div>
      <div
        className={
          embedded
            ? "mt-5"
            : "mt-5 min-h-0 flex-1 overflow-y-auto overscroll-contain"
        }
      >
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <Section title="Parsed files">
            {files.length ? (
              <div className="divide-y rounded-md border bg-background">
                {files.map((file) => (
                  <div
                    key={file.id}
                    className="grid gap-3 p-4 text-sm md:grid-cols-[1.4fr_repeat(4,auto)]"
                  >
                    <strong>{file.label}</strong>
                    <span>{file.wordCount.toLocaleString()} words</span>
                    <span>{file.pageCount} pages</span>
                    <span>{file.claimCount} claims</span>
                    <span>{file.drawingCount} drawings</span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState message="Select at least one file to preview the parsed metrics." />
            )}
          </Section>
          <Section title="Mock parser findings">
            {findings.length ? (
              <div className="space-y-2.5">
                {findings.map((finding) => (
                  <div
                    key={finding.id}
                    className="rounded-md border bg-background p-4 text-sm"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-medium">{finding.title}</p>
                        <p className="mt-1 text-muted-foreground">
                          {finding.detail}
                        </p>
                      </div>
                      <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                        {finding.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState message="Parser findings will appear after at least one file is selected." />
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}

export function ConfigStep({
  config,
  configFieldErrors,
  sourceMode,
  patentNumber,
  onChange,
}: {
  config: WizardConfig;
  configFieldErrors: WizardConfigFieldErrors;
  sourceMode: WizardSourceMode;
  patentNumber?: string;
  onChange: (config: WizardConfig) => void;
}) {
  const dueDateRef = useRef<HTMLInputElement | null>(null);
  const channelLabel = labelForOption(channelOptions, config.purpose);
  const isChannelLocked = sourceMode === "patent_search";
  const hasFilingService = config.serviceTypes.includes("filing");
  const hasEpvService = config.serviceTypes.includes("epv");

  function openDueDatePicker() {
    const input = dueDateRef.current;
    if (!input) {
      return;
    }

    input.focus();
    (
      input as HTMLInputElement & {
        showPicker?: () => void;
      }
    ).showPicker?.();
  }

  function handleServiceTypeToggle(serviceType: string, checked: boolean) {
    const nextServiceTypes = checked
      ? config.serviceTypes.includes(serviceType)
        ? config.serviceTypes
        : [...config.serviceTypes, serviceType]
      : config.serviceTypes.filter((item) => item !== serviceType);

    onChange({
      ...config,
      serviceTypes: nextServiceTypes,
      filingType: nextServiceTypes.includes("filing") ? config.filingType : "",
      filingApplicationType: nextServiceTypes.includes("filing")
        ? config.filingApplicationType
        : "",
      entityType: nextServiceTypes.includes("filing") ? config.entityType : "",
      epvType: nextServiceTypes.includes("epv") ? config.epvType : "",
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 space-y-5">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            {channelLabel
              ? `${channelLabel} Cost Management`
              : "Cost Management"}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Configure the quote inputs before submitting.
          </p>
        </div>
      </div>
      <div className="mt-5 min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="grid gap-4 md:grid-cols-2">
          {patentNumber ? (
            <>
              <div className="space-y-2">
                <Label>Patent number</Label>
                <div className="flex min-h-10 items-center rounded-md border bg-muted/20 px-3 text-sm font-medium">
                  {patentNumber}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Channels</Label>
                <div className={getFieldClassName(Boolean(configFieldErrors.purpose), "flex min-h-10 items-center bg-muted/20 px-3 text-sm font-medium")}>
                  {channelLabel}
                </div>
                {configFieldErrors.purpose ? (
                  <p className="text-sm text-destructive">{configFieldErrors.purpose}</p>
                ) : null}
              </div>
            </>
          ) : null}
          {!patentNumber ? (
            <div className="md:col-span-2">
              <SelectField
                label="Channels"
                value={config.purpose}
                options={channelOptions}
                placeholder="Choose an application channel"
                disabled={isChannelLocked}
                error={configFieldErrors.purpose}
                onChange={onConfigValueChange(config, onChange, "purpose")}
              />
            </div>
          ) : null}
          <div className="md:col-span-2">
            <ServiceTypeField
              error={configFieldErrors.serviceTypes}
              value={config.serviceTypes}
              onToggle={handleServiceTypeToggle}
            />
          </div>
          {hasFilingService ? (
            <div className="grid gap-4 md:col-span-2 md:grid-cols-3">
              <SelectField
                label="Filing Type"
                value={config.filingType ?? ""}
                options={filingTypeOptions}
                placeholder="Choose a filing type"
                error={configFieldErrors.filingType}
                onChange={onConfigValueChange(config, onChange, "filingType")}
              />
              <SelectField
                label="Application Type"
                value={config.filingApplicationType ?? ""}
                options={filingApplicationTypeOptions}
                placeholder="Choose an application type"
                error={configFieldErrors.filingApplicationType}
                onChange={onConfigValueChange(config, onChange, "filingApplicationType")}
              />
              <SelectField
                label="Entity Type"
                value={config.entityType ?? ""}
                options={entityTypeOptions}
                placeholder="Choose an entity type"
                error={configFieldErrors.entityType}
                onChange={onConfigValueChange(config, onChange, "entityType")}
              />
            </div>
          ) : null}
          {hasEpvService ? (
            <SelectField
              label="EPV Type"
              value={config.epvType ?? ""}
              options={epvTypeOptions}
              placeholder="Choose an EPV type"
              error={configFieldErrors.epvType}
              onChange={onConfigValueChange(config, onChange, "epvType")}
            />
          ) : null}
          <SelectField
            label="Patent Language"
            value={config.sourceLanguage}
            placeholder="Choose a patent language"
            options={sourceLanguageOptions}
            error={configFieldErrors.sourceLanguage}
            onChange={onConfigValueChange(config, onChange, "sourceLanguage")}
          />
          <MultiSelectField
            label="Jurisdictions"
            values={config.targetLanguages}
            options={targetLanguageOptions}
            placeholder="Choose jurisdictions"
            error={configFieldErrors.targetLanguages}
            onToggle={(targetLanguage, checked) =>
              onChange({
                ...config,
                targetLanguages: checked
                  ? config.targetLanguages.includes(targetLanguage)
                    ? config.targetLanguages
                    : [...config.targetLanguages, targetLanguage]
                  : config.targetLanguages.filter((item) => item !== targetLanguage),
              })
            }
          />
          <SelectField
            label="Scope"
            value={config.scopeType}
            options={scopeOptions}
            onChange={onConfigValueChange(config, onChange, "scopeType")}
          />
          <SelectField
            label="Quality"
            value={config.qualityLevel}
            options={qualityOptions}
            onChange={onConfigValueChange(config, onChange, "qualityLevel")}
          />
          <Field label="Due date">
            <Input
              aria-invalid={Boolean(configFieldErrors.dueAt)}
              className={getFieldClassName(Boolean(configFieldErrors.dueAt))}
              required
              ref={dueDateRef}
              value={config.dueAt}
              type="date"
              min={getTomorrowDateInputValue()}
              onClick={openDueDatePicker}
              onChange={(event) =>
                onChange({ ...config, dueAt: event.target.value })
              }
            />
            {configFieldErrors.dueAt ? (
              <p className="text-sm text-destructive">{configFieldErrors.dueAt}</p>
            ) : null}
          </Field>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="customScope">
              Custom pages / paragraphs or special requirements
            </Label>
            <Input
              className={requesterFieldClassName}
              id="customScope"
              value={config.customScope}
              onChange={(event) =>
                onChange({ ...config, customScope: event.target.value })
              }
              placeholder="Pages 1-20, claim set A..."
            />
          </div>
          <label className="flex items-center gap-2 text-sm md:col-span-2">
            <Checkbox
              checked={config.isUrgent}
              onCheckedChange={(checked) =>
                onChange({ ...config, isUrgent: checked === true })
              }
            />
            Urgent
          </label>
        </div>
      </div>
    </div>
  );
}

function ServiceTypeField(props: {
  error?: string;
  value: string[];
  onToggle: (serviceType: string, checked: boolean) => void;
}) {
  return (
    <Field label="Service type">
      <div className="grid gap-3 md:grid-cols-2">
        {serviceTypeOptions.map((option) => {
          const checked = props.value.includes(option.value);

          return (
            <label
              key={option.value}
              className={getFieldClassName(Boolean(props.error), "flex min-h-11 items-center gap-3 px-3 py-2 text-sm transition-colors hover:bg-muted/20")}
            >
              <Checkbox
                checked={checked}
                onCheckedChange={(nextChecked) =>
                  props.onToggle(option.value, nextChecked === true)
                }
              />
              <span className="font-medium">{option.label}</span>
            </label>
          );
        })}
      </div>
      {props.error ? <p className="text-sm text-destructive">{props.error}</p> : null}
    </Field>
  );
}

function SelectField(props: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
  error?: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={props.label}>
      <Select
        value={props.value || undefined}
        onValueChange={props.onChange}
        disabled={props.disabled}
      >
        <SelectTrigger
          aria-invalid={Boolean(props.error)}
          className={getFieldClassName(Boolean(props.error))}
        >
          <SelectValue placeholder={props.placeholder} />
        </SelectTrigger>
        <SelectContent>
          {props.options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {props.error ? <p className="text-sm text-destructive">{props.error}</p> : null}
    </Field>
  );
}

function MultiSelectField(props: {
  label: string;
  values: string[];
  options: Array<{ value: string; label: string }>;
  placeholder: string;
  error?: string;
  onToggle: (value: string, checked: boolean) => void;
}) {
  const valueLabel = props.values.length
    ? joinOptionLabels(props.options, props.values)
    : props.placeholder;

  return (
    <Field label={props.label}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            aria-invalid={Boolean(props.error)}
            className={getFieldClassName(Boolean(props.error), "h-10 w-full justify-between px-3 font-normal")}
          >
            <span className={props.values.length ? "text-foreground" : "text-muted-foreground"}>
              {valueLabel}
            </span>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)]">
          {props.options.map((option) => (
            <DropdownMenuCheckboxItem
              key={option.value}
              checked={props.values.includes(option.value)}
              onCheckedChange={(checked) =>
                props.onToggle(option.value, checked === true)
              }
              onSelect={(event) => event.preventDefault()}
            >
              {option.label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {props.error ? <p className="text-sm text-destructive">{props.error}</p> : null}
    </Field>
  );
}

const requesterFieldClassName =
  "focus-visible:ring-0 focus-visible:border-border focus:ring-0 focus:border-border data-[state=open]:border-border";

function getFieldClassName(invalid: boolean, baseClassName = "") {
  return `${requesterFieldClassName} ${baseClassName} rounded-md border ${invalid ? "border-destructive focus-visible:border-destructive focus:border-destructive data-[state=open]:border-destructive" : ""}`.trim();
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="font-medium">{title}</h3>
      {children}
    </section>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-dashed bg-background px-4 py-6 text-sm text-muted-foreground">
      {message}
    </div>
  );
}

function buildParseMetrics(files: ReturnType<typeof parsePreviewFiles>) {
  return {
    fileCount: files.length,
    wordCount: files.reduce((total, file) => total + file.wordCount, 0),
    claimCount: files.reduce((total, file) => total + file.claimCount, 0),
    drawingCount: files.reduce((total, file) => total + file.drawingCount, 0),
  };
}

function buildParseFindings(files: ReturnType<typeof parsePreviewFiles>) {
  const statuses = [
    "Parsed",
    "Analyzed",
    "Structure mapped",
    "Ready for quote",
  ];

  return files.flatMap((file, index) => [
    {
      id: `${file.id}-layout`,
      title: `${file.label} layout map`,
      detail: `Detected ${Math.max(3, Math.ceil(file.pageCount / 4))} sections and ${Math.max(1, Math.ceil(file.claimCount / 6) || 1)} claim groups.`,
      status: statuses[index % statuses.length],
    },
    {
      id: `${file.id}-language`,
      title: `${file.label} language and terminology pass`,
      detail: `Source language ${file.language.toUpperCase()} confirmed. Terminology pack matched ${Math.max(12, Math.ceil(file.wordCount / 850))} domain phrases for downstream quote calibration.`,
      status: statuses[(index + 1) % statuses.length],
    },
  ]);
}

function labelForOption(
  options: Array<{ value: string; label: string }>,
  value?: string,
) {
  return options.find((option) => option.value === value)?.label;
}

function joinOptionLabels(
  options: Array<{ value: string; label: string }>,
  values: string[],
) {
  return values
    .map((value) => labelForOption(options, value) ?? value)
    .join(", ");
}
