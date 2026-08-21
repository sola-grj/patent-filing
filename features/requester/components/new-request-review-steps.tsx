"use client";

import { ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  entityTypeOptions,
  epoSourceLanguageOptions,
  filingApplicationTypeOptions,
  filingTypeOptions,
  jurisdictionOptions,
  mockUnitaryTargetLanguageOptions,
  sourceLanguageOptions,
  traditionalServiceItemOptions,
} from "@/features/requester/options";
import {
  getEpoServiceAvailability,
  type EpoServiceAvailability,
} from "@/features/requester/deadlines";
import {
  getServiceTypeSelection,
  getServiceTypeSelections,
  isTraditionalValidation,
  requestPathLabels,
  requiresEpCountries,
  usesEpoTargetLanguages,
  type ServiceTypeSelectionValue,
} from "@/features/requester/request-paths";
import type {
  WizardConfig,
  WizardDictionaries,
  WizardPatentAnalysisResult,
  WizardPatentCandidate,
  WizardPayload,
} from "@/features/requester/wizard-types";
import {
  onConfigValueChange,
  normalizeEpoTargetLanguages,
  parsePreviewFiles,
  requiresSourceLanguage,
  type WizardConfigFieldErrors,
} from "./new-request-wizard-utils";
import { Field, Metric } from "./new-request-wizard-shared";
import { EpCountrySelector } from "./ep-country-selector";
import { PatentBasicInfo } from "./patent-basic-info";
import { ServiceTypeCards } from "./service-type-cards";

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
  patent,
  analysis,
  onChange,
  dictionaries,
}: {
  config: WizardConfig;
  configFieldErrors: WizardConfigFieldErrors;
  patent?: WizardPatentCandidate;
  analysis?: WizardPatentAnalysisResult;
  onChange: (config: WizardConfig) => void;
  dictionaries: WizardDictionaries;
}) {
  const channelLabel = requestPathLabels[config.channelCode]
    ?? labelForOption(dictionaries.channels, config.channelCode);
  const hasFilingService = config.serviceTypes.includes("filing");
  const showTraditionalItems = isTraditionalValidation(config.epServiceType);
  const showSourceLanguage = requiresSourceLanguage(config);
  const showEpCountries = config.channelCode === "ep"
    && requiresEpCountries(config.epServiceType);
  const serviceAvailability = Object.fromEntries(
    getServiceTypeSelections(config.channelCode).map((option) => [
      option.value,
      getEpoServiceAvailability(option.epServiceType, patent, analysis),
    ]),
  ) as Partial<Record<ServiceTypeSelectionValue, EpoServiceAvailability>>;

  function handleServiceTypeChange(serviceType: ServiceTypeSelectionValue) {
    const selection = getServiceTypeSelection(serviceType);
    if (!selection) return;
    if (serviceAvailability[serviceType]?.available === false) return;
    const nextServiceTypes = config.channelCode === "ep" && config.translationRequired
      ? [...selection.serviceTypes, "translation"]
      : [...selection.serviceTypes];
    const nextServiceItem = isTraditionalValidation(selection.epServiceType)
      ? config.serviceItem || "traditional_validation"
      : "";
    const nextRequiresCountries = requiresEpCountries(selection.epServiceType);
    onChange({
      ...config,
      serviceTypes: nextServiceTypes,
      dueAt: "",
      filingType: nextServiceTypes.includes("filing") ? config.filingType : "",
      filingApplicationType: nextServiceTypes.includes("filing")
        ? config.filingApplicationType
        : "",
      entityType: config.entityType,
      epvType: selection.epvType,
      epServiceType: selection.epServiceType,
      serviceItem: nextServiceItem,
      epCountryIds: nextRequiresCountries ? config.epCountryIds : [],
      epCountriesConfirmed: nextRequiresCountries
        ? config.epCountriesConfirmed
        : false,
      optOutCountryIds: nextServiceItem === "traditional_validation_opt_out"
        ? config.optOutCountryIds.filter((id) => config.epCountryIds.includes(id))
        : [],
      optOutCountriesConfirmed: false,
      targetLanguages: normalizeEpoTargetLanguages(
        selection.epServiceType,
        config.translationRequired,
        config.sourceLanguage,
        config.targetLanguages,
      ),
      pctChapter: config.channelCode === "pct" && nextServiceTypes.includes("filing")
        ? config.pctChapter || "chapter_i"
        : "",
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
        {patent ? <PatentBasicInfo patent={patent} /> : null}
        <div className={`grid gap-4 md:grid-cols-2 ${patent ? "mt-5" : ""}`}>
          <div className="md:col-span-2">
            <ServiceTypeCards
              channelCode={config.channelCode}
              epvType={config.epvType}
              epServiceType={config.epServiceType}
              error={configFieldErrors.serviceTypes}
              value={config.serviceTypes}
              availability={serviceAvailability}
              onChange={handleServiceTypeChange}
            />
          </div>
          {config.channelCode === "ep" ? (
            <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border bg-background px-4 py-3.5 text-sm shadow-sm transition-colors hover:bg-muted/30 md:col-span-2">
              <span className="font-medium">Translation Service</span>
              <Checkbox
                aria-label="Translation Service"
                checked={config.translationRequired}
                onCheckedChange={(checked) => {
                  const translationRequired = checked === true;
                  onChange({
                    ...config,
                    translationRequired,
                    serviceTypes: translationRequired
                      ? [...new Set([...config.serviceTypes, "translation"])]
                      : config.serviceTypes.filter((value) => value !== "translation"),
                    targetLanguages: normalizeEpoTargetLanguages(
                      config.epServiceType,
                      translationRequired,
                      config.sourceLanguage,
                      config.targetLanguages,
                    ),
                  });
                }}
              />
            </label>
          ) : null}
          {hasFilingService ? (
            <div className="grid gap-4 md:contents">
              <SelectField
                label="Filing Type"
                value={config.filingType ?? ""}
                options={dictionaries.filingTypes.length
                  ? dictionaries.filingTypes
                  : filingTypeOptions}
                placeholder="Choose a filing type"
                error={configFieldErrors.filingType}
                required
                onChange={onConfigValueChange(config, onChange, "filingType")}
              />
              <SelectField
                label="Application Type"
                value={config.filingApplicationType ?? ""}
                options={dictionaries.applicationTypes.length
                  ? dictionaries.applicationTypes
                  : filingApplicationTypeOptions}
                placeholder="Choose an application type"
                error={configFieldErrors.filingApplicationType}
                required
                onChange={onConfigValueChange(config, onChange, "filingApplicationType")}
              />
              <SelectField
                label="Entity Type"
                value={config.entityType ?? ""}
                options={dictionaries.entityTypes.length
                  ? dictionaries.entityTypes
                  : entityTypeOptions}
                placeholder="Choose an entity type"
                error={configFieldErrors.entityType}
                required
                onChange={onConfigValueChange(config, onChange, "entityType")}
              />
            </div>
          ) : null}
          {showTraditionalItems ? (
            <fieldset className="space-y-3 rounded-lg border p-4 md:col-span-2">
              <legend className="px-1 text-sm font-medium">
                <span className="text-destructive" aria-hidden="true">*</span>{" "}
                Service Items
              </legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {traditionalServiceItemOptions.map((option) => (
                  <label key={option.value} className="flex cursor-pointer items-center gap-2 rounded-md border bg-background px-3 py-2.5 text-sm">
                    <input
                      type="radio"
                      name="traditional-service-item"
                      value={option.value}
                      checked={config.serviceItem === option.value}
                      onChange={() => onChange({
                        ...config,
                        serviceItem: option.value,
                        optOutCountryIds: option.value === "traditional_validation_opt_out"
                          ? config.optOutCountryIds.filter((id) => config.epCountryIds.includes(id))
                          : [],
                        optOutCountriesConfirmed: false,
                      })}
                    />
                    {option.label}
                  </label>
                ))}
              </div>
              {configFieldErrors.serviceItem ? (
                <p className="text-sm text-destructive">{configFieldErrors.serviceItem}</p>
              ) : null}
            </fieldset>
          ) : null}
          {hasFilingService && config.channelCode === "pct" ? (
            <label className="flex items-start gap-3 rounded-lg border bg-muted/20 p-3 text-sm md:col-span-2">
              <Checkbox
                checked={config.pctChapter === "chapter_ii"}
                onCheckedChange={(checked) =>
                  onChange({
                    ...config,
                    pctChapter: checked === true ? "chapter_ii" : "chapter_i",
                  })
                }
              />
              <span>
                <span className="block font-medium">
                  Has a PCT Chapter II Demand been filed?
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  Leave unchecked to calculate the national-phase deadline under Chapter I.
                </span>
                {configFieldErrors.pctChapter ? (
                  <span className="mt-1 block text-sm text-destructive">
                    {configFieldErrors.pctChapter}
                  </span>
                ) : null}
              </span>
            </label>
          ) : null}
          {showSourceLanguage ? (
            <SearchableSingleSelectField
              label="Source Language"
              value={config.sourceLanguage}
              placeholder="Choose a source language"
              options={config.channelCode === "ep" ? epoSourceLanguageOptions : sourceLanguageOptions}
              error={configFieldErrors.sourceLanguage}
              required
              onChange={(sourceLanguage) => onChange({
                ...config,
                sourceLanguage,
                targetLanguages: config.channelCode === "ep"
                  ? normalizeEpoTargetLanguages(
                      config.epServiceType,
                      config.translationRequired,
                      sourceLanguage,
                      config.targetLanguages,
                    )
                  : config.targetLanguages,
              })}
            />
          ) : null}
          {config.channelCode === "ep"
            && config.translationRequired
            && usesEpoTargetLanguages(config.epServiceType) ? (
              config.epServiceType === "unitary_patent" ? (
                  config.sourceLanguage === "en" ? (
                    <SearchableSingleSelectField
                      label="Target Language"
                      value={config.targetLanguages[0] ?? ""}
                      placeholder="Choose one target language"
                      options={mockUnitaryTargetLanguageOptions.filter((option) => option.value !== "en")}
                      error={configFieldErrors.targetLanguages}
                      required
                      onChange={(value) => onChange({ ...config, targetLanguages: [value] })}
                    />
                  ) : (
                    <ReadonlyLanguageList
                      label="Target Language"
                      values={config.targetLanguages}
                      error={configFieldErrors.targetLanguages}
                    />
                  )
                ) : (
                  <ReadonlyLanguageList
                    label="Target Languages"
                    values={config.targetLanguages}
                    error={configFieldErrors.targetLanguages}
                  />
                )
            ) : null}
          {showEpCountries ? (
            <>
              <EpCountrySelector
                title="EP countries"
                description="Select the countries covered by this service, then confirm the selection."
                values={config.epCountryIds}
                options={dictionaries.epCountries}
                confirmed={config.epCountriesConfirmed}
                error={configFieldErrors.epCountryIds}
                onChange={(epCountryIds) => onChange({
                  ...config,
                  epCountryIds,
                  epCountriesConfirmed: false,
                  optOutCountryIds: config.optOutCountryIds.filter((id) => epCountryIds.includes(id)),
                  optOutCountriesConfirmed: false,
                })}
                onConfirm={() => onChange({ ...config, epCountriesConfirmed: true })}
              />
              {config.serviceItem === "traditional_validation_opt_out"
                && config.epCountriesConfirmed ? (
                  <EpCountrySelector
                    title="Opt Out countries"
                    description="Choose the Opt Out subset from the confirmed business countries."
                    values={config.optOutCountryIds}
                    options={dictionaries.epCountries.filter((country) => config.epCountryIds.includes(country.id))}
                    confirmed={config.optOutCountriesConfirmed}
                    error={configFieldErrors.optOutCountryIds}
                    onChange={(optOutCountryIds) => onChange({
                      ...config,
                      optOutCountryIds,
                      optOutCountriesConfirmed: false,
                    })}
                    onConfirm={() => onChange({ ...config, optOutCountriesConfirmed: true })}
                  />
                ) : null}
            </>
          ) : config.channelCode !== "ep" ? (
            <MultiSelectField
              label="Jurisdictions"
              values={config.jurisdictionCodes}
              options={dictionaries.jurisdictions.length
                ? dictionaries.jurisdictions
                : jurisdictionOptions}
              placeholder="Choose jurisdictions"
              error={configFieldErrors.jurisdictionCodes}
              required
              onToggle={(targetLanguage, checked) =>
                onChange({
                  ...config,
                  jurisdictionCodes: checked
                    ? [...new Set([...config.jurisdictionCodes, targetLanguage])]
                    : config.jurisdictionCodes.filter((item) => item !== targetLanguage),
                })
              }
            />
          ) : null}
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="customScope">
              Custom pages / paragraphs or special requirements
            </Label>
            <Textarea
              className={`${requesterFieldClassName} min-h-28 resize-y`}
              id="customScope"
              value={config.customScope}
              onChange={(event) =>
                onChange({ ...config, customScope: event.target.value })
              }
              placeholder="Pages 1-20, claim set A, paragraph-specific instructions..."
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

function ReadonlyLanguageList({
  label,
  values,
  error,
}: {
  label: string;
  values: string[];
  error?: string;
}) {
  const options = [...sourceLanguageOptions, ...mockUnitaryTargetLanguageOptions];
  return (
    <Field label={label} required>
      <div
        aria-invalid={Boolean(error)}
        className={getFieldClassName(
          Boolean(error),
          "flex min-h-10 flex-wrap items-center gap-2 bg-muted/30 px-3 py-2",
        )}
      >
        {values.length ? values.map((value) => (
          <span key={value} className="rounded-full border bg-background px-2.5 py-1 text-xs font-medium">
            {labelForOption(options, value) ?? value}
          </span>
        )) : (
          <span className="text-sm text-muted-foreground">Select a source language first.</span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">Target selection is locked by the service rule.</p>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
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
  required?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={props.label} required={props.required}>
      <Select
        value={props.value || undefined}
        onValueChange={props.onChange}
        disabled={props.disabled}
      >
        <SelectTrigger
          aria-invalid={Boolean(props.error)}
          aria-required={props.required}
          className={getFieldClassName(Boolean(props.error), "h-10")}
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

function SearchableSingleSelectField(props: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  placeholder: string;
  error?: string;
  required?: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selectedLabel = props.options.find((option) => option.value === props.value)?.label;
  const filteredOptions = filterOptions(props.options, query);

  return (
    <Field label={props.label} required={props.required}>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            aria-invalid={Boolean(props.error)}
            aria-required={props.required}
            className={getFieldClassName(Boolean(props.error), "h-10 w-full justify-between px-3 font-normal")}
          >
            <span className={selectedLabel ? "text-foreground" : "text-muted-foreground"}>
              {selectedLabel ?? props.placeholder}
            </span>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <SearchableDropdownContent query={query} onQueryChange={setQuery}>
          {filteredOptions.map((option) => (
            <DropdownMenuItem
              key={option.value}
              onSelect={() => {
                props.onChange(option.value);
                setOpen(false);
              }}
            >
              {option.label}
            </DropdownMenuItem>
          ))}
          {!filteredOptions.length ? <EmptySearchResult /> : null}
        </SearchableDropdownContent>
      </DropdownMenu>
      {props.error ? <p className="text-sm text-destructive">{props.error}</p> : null}
    </Field>
  );
}

function MultiSelectField(props: {
  label: string;
  values: string[];
  options: Array<{
    value: string;
    label: string;
    isoCountryCode?: string;
  }>;
  placeholder: string;
  error?: string;
  required?: boolean;
  onToggle: (value: string, checked: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const valueLabel = props.values.length
    ? joinOptionLabels(props.options, props.values)
    : props.placeholder;
  const filteredOptions = filterOptions(props.options, query);

  return (
    <Field label={props.label} required={props.required}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            aria-invalid={Boolean(props.error)}
            aria-required={props.required}
            className={getFieldClassName(Boolean(props.error), "h-10 w-full justify-between px-3 font-normal")}
          >
            <span className={`truncate ${props.values.length ? "text-foreground" : "text-muted-foreground"}`}>
              {valueLabel}
            </span>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <SearchableDropdownContent query={query} onQueryChange={setQuery}>
          {filteredOptions.map((option) => (
            <DropdownMenuCheckboxItem
              key={option.value}
              checked={props.values.includes(option.value)}
              onCheckedChange={(checked) =>
                props.onToggle(option.value, checked === true)
              }
              onSelect={(event) => event.preventDefault()}
            >
              <CountryOptionLabel option={option} />
            </DropdownMenuCheckboxItem>
          ))}
          {!filteredOptions.length ? <EmptySearchResult /> : null}
        </SearchableDropdownContent>
      </DropdownMenu>
      {props.error ? <p className="text-sm text-destructive">{props.error}</p> : null}
    </Field>
  );
}

function SearchableDropdownContent({
  query,
  onQueryChange,
  children,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)] overflow-hidden p-0">
      <div className="border-b bg-popover p-2">
        <Input
          value={query}
          placeholder="Search..."
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => event.stopPropagation()}
        />
      </div>
      <div className="max-h-64 overflow-y-auto p-1">{children}</div>
    </DropdownMenuContent>
  );
}

function CountryOptionLabel({
  option,
}: {
  option: { value: string; label: string; isoCountryCode?: string };
}) {
  const countryCode = (option.isoCountryCode ?? option.value).toLowerCase();
  return (
    <span className="flex items-center gap-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`https://flagcdn.com/20x15/${countryCode}.png`}
        srcSet={`https://flagcdn.com/40x30/${countryCode}.png 2x`}
        width="20"
        height="15"
        alt=""
        className="shrink-0 rounded-[2px] object-cover"
      />
      <span>{option.label}</span>
    </span>
  );
}

function EmptySearchResult() {
  return <p className="px-3 py-4 text-sm text-muted-foreground">No options found.</p>;
}

function filterOptions<T extends { value: string; label: string }>(
  options: T[],
  query: string,
) {
  const normalizedQuery = query.trim().toLowerCase();
  return normalizedQuery
    ? options.filter((option) =>
        `${option.label} ${option.value}`.toLowerCase().includes(normalizedQuery),
      )
    : options;
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
