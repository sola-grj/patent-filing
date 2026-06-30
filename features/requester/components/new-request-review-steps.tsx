"use client";

import { useRef, type ReactNode } from "react";

import { Checkbox } from "@/components/ui/checkbox";
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
  purposeOptions,
  qualityOptions,
  scopeOptions,
  sourceLanguageOptions,
  targetLanguageOptions,
} from "@/features/requester/options";
import type {
  WizardConfig,
  WizardPayload,
} from "@/features/requester/wizard-types";
import {
  onConfigValueChange,
  parsePreviewFiles,
} from "./new-request-wizard-utils";
import { Field, Metric, StepShell } from "./new-request-wizard-shared";

export function ParseStep({ payload }: { payload: WizardPayload }) {
  const files = parsePreviewFiles(payload);
  const findings = buildParseFindings(files);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 space-y-5">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            Parse preview
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Mock parser output shown before the request is persisted.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          <Metric title="Files" value={files.length} />
          <Metric
            title="Words"
            value={files.reduce((total, file) => total + file.wordCount, 0)}
          />
          <Metric
            title="Pages"
            value={files.reduce((total, file) => total + file.pageCount, 0)}
          />
          <Metric title="Parser findings" value={findings.length} />
        </div>
      </div>
      <div className="mt-5 min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="space-y-5">
          <Section title="Parsed files">
            <div className="divide-y rounded-md border">
              {files.map((file) => (
                <div
                  key={file.id}
                  className="grid gap-3 p-4 text-sm md:grid-cols-[1.4fr_repeat(4,auto)]"
                >
                  <strong>{file.label}</strong>
                  <span>{file.wordCount.toLocaleString()} words</span>
                  <span>{file.pageCount} pages</span>
                  <span>{file.claimCount} claims</span>
                  <span className="text-muted-foreground">
                    OCR no · Review no
                  </span>
                </div>
              ))}
            </div>
          </Section>
          <Section title="Mock parser findings">
            <div className="space-y-2.5">
              {findings.map((finding) => (
                <div key={finding.id} className="rounded-md border p-4 text-sm">
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
          </Section>
        </div>
      </div>
    </div>
  );
}

export function ConfigStep({
  config,
  onChange,
}: {
  config: WizardConfig;
  onChange: (config: WizardConfig) => void;
}) {
  const dueDateRef = useRef<HTMLInputElement | null>(null);

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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 space-y-5">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            Translation configuration
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Configure the quote inputs before submitting.
          </p>
        </div>
      </div>
      <div className="mt-5 min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="grid gap-4 md:grid-cols-2">
          <SelectField
            name="sourceLanguage"
            label="Source language"
            value={config.sourceLanguage}
            options={sourceLanguageOptions}
            onChange={onConfigValueChange(config, onChange, "sourceLanguage")}
          />
          <SelectField
            name="targetLanguage"
            label="Target language"
            value={config.targetLanguage}
            options={targetLanguageOptions}
            onChange={onConfigValueChange(config, onChange, "targetLanguage")}
          />
          <SelectField
            name="scopeType"
            label="Scope"
            value={config.scopeType}
            options={scopeOptions}
            onChange={onConfigValueChange(config, onChange, "scopeType")}
          />
          <SelectField
            name="purpose"
            label="Purpose"
            value={config.purpose}
            options={purposeOptions}
            onChange={onConfigValueChange(config, onChange, "purpose")}
          />
          <SelectField
            name="qualityLevel"
            label="Quality"
            value={config.qualityLevel}
            options={qualityOptions}
            onChange={onConfigValueChange(config, onChange, "qualityLevel")}
          />
          <Field label="Due date">
            <Input
              className={requesterFieldClassName}
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

export function QuoteStep({ payload }: { payload: WizardPayload }) {
  return <QuoteStepContent payload={payload} />;
}

export function QuoteStepContent({
  payload,
  action,
}: {
  payload: WizardPayload;
  action?: ReactNode;
}) {
  const wordCount = parsePreviewFiles(payload).reduce(
    (total, file) => total + file.wordCount,
    0,
  );
  const base = Math.round(wordCount * 0.12);
  const quality = payload.config.qualityLevel.includes("review")
    ? 1.65
    : payload.config.qualityLevel.includes("patent")
      ? 1.35
      : 1;
  const urgent = payload.config.isUrgent ? 1.25 : 1;
  const total = Math.round(base * quality * urgent);

  return (
    <StepShell
      title="Quote preview"
      description="This mock quote will become a persisted quote after submission."
    >
      <div className="grid gap-4 md:grid-cols-3">
        <Metric title="Word count" value={wordCount} />
        <Metric
          title="Estimated total"
          value={`$${total.toLocaleString()}`}
          action={action}
        />
        <Metric title="Due date" value={payload.config.dueAt || "-"} />
      </div>
      <div className="rounded-md border p-4 text-sm text-muted-foreground mt-2">
        Based on {payload.config.sourceLanguage} to{" "}
        {payload.config.targetLanguage}, {payload.config.qualityLevel}, and{" "}
        {payload.config.isUrgent ? "urgent" : "standard"} handling.
      </div>
    </StepShell>
  );
}

function SelectField(props: {
  name: keyof WizardConfig;
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={props.label}>
      <Select value={props.value} onValueChange={props.onChange}>
        <SelectTrigger className={requesterFieldClassName}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {props.options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

const requesterFieldClassName =
  "focus-visible:ring-0 focus-visible:border-border focus:ring-0 focus:border-border data-[state=open]:border-border";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="font-medium">{title}</h3>
      {children}
    </section>
  );
}

function buildParseFindings(files: ReturnType<typeof parsePreviewFiles>) {
  const statuses = [
    "Parsed",
    "OCR review",
    "Structure mapped",
    "Ready for quote",
  ];

  return files.flatMap((file, index) => [
    {
      id: `${file.id}-layout`,
      title: `${file.label} layout map`,
      detail: `Detected ${Math.max(3, Math.ceil(file.pageCount / 4))} sections, ${Math.max(1, Math.ceil(file.claimCount / 6) || 1)} claim groups, and ${Math.max(1, Math.ceil(file.wordCount / 3200))} review batches.`,
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
