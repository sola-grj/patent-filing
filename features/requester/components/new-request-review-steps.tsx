"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import type { WizardConfig, WizardPayload } from "@/features/requester/wizard-types";
import { onConfigValueChange, parsePreviewFiles } from "./new-request-wizard-utils";
import { Field, Metric, StepShell } from "./new-request-wizard-shared";

export function ParseStep({ payload }: { payload: WizardPayload }) {
  const files = parsePreviewFiles(payload);

  return (
    <StepShell title="Parse preview" description="Mock parser output shown before the request is persisted.">
      <div className="grid gap-4 md:grid-cols-3">
        <Metric title="Files" value={files.length} />
        <Metric title="Words" value={files.reduce((total, file) => total + file.wordCount, 0)} />
        <Metric title="Pages" value={files.reduce((total, file) => total + file.pageCount, 0)} />
      </div>
      <div className="divide-y rounded-md border">
        {files.map((file) => (
          <div key={file.id} className="grid gap-3 p-4 text-sm md:grid-cols-[1.4fr_repeat(4,auto)]">
            <strong>{file.label}</strong>
            <span>{file.wordCount.toLocaleString()} words</span>
            <span>{file.pageCount} pages</span>
            <span>{file.claimCount} claims</span>
            <span className="text-muted-foreground">OCR no · Review no</span>
          </div>
        ))}
      </div>
    </StepShell>
  );
}

export function ConfigStep({
  config,
  onChange,
}: {
  config: WizardConfig;
  onChange: (config: WizardConfig) => void;
}) {
  return (
    <StepShell title="Translation configuration" description="Configure the quote inputs before submitting.">
      <div className="grid gap-4 md:grid-cols-2">
        <SelectField name="sourceLanguage" label="Source language" value={config.sourceLanguage} options={sourceLanguageOptions} onChange={onConfigValueChange(config, onChange, "sourceLanguage")} />
        <SelectField name="targetLanguage" label="Target language" value={config.targetLanguage} options={targetLanguageOptions} onChange={onConfigValueChange(config, onChange, "targetLanguage")} />
        <SelectField name="scopeType" label="Scope" value={config.scopeType} options={scopeOptions} onChange={onConfigValueChange(config, onChange, "scopeType")} />
        <SelectField name="purpose" label="Purpose" value={config.purpose} options={purposeOptions} onChange={onConfigValueChange(config, onChange, "purpose")} />
        <SelectField name="qualityLevel" label="Quality" value={config.qualityLevel} options={qualityOptions} onChange={onConfigValueChange(config, onChange, "qualityLevel")} />
        <SelectField
          name="deliveryOption"
          label="Delivery"
          value={config.deliveryOption}
          options={[{ value: "standard", label: "Standard" }, { value: "expedited", label: "Expedited" }, { value: "custom", label: "Custom" }]}
          onChange={onConfigValueChange(config, onChange, "deliveryOption")}
        />
        <Field label="Due date">
          <Input value={config.dueAt} type="date" onChange={(event) => onChange({ ...config, dueAt: event.target.value })} />
        </Field>
        <label className="flex items-center gap-2 pt-8 text-sm">
          <Checkbox checked={config.isUrgent} onCheckedChange={(checked) => onChange({ ...config, isUrgent: checked === true })} />
          Urgent
        </label>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="customScope">Custom pages / paragraphs or special requirements</Label>
          <Input id="customScope" value={config.customScope} onChange={(event) => onChange({ ...config, customScope: event.target.value })} placeholder="Pages 1-20, claim set A..." />
        </div>
      </div>
    </StepShell>
  );
}

export function QuoteStep({ payload }: { payload: WizardPayload }) {
  const wordCount = parsePreviewFiles(payload).reduce((total, file) => total + file.wordCount, 0);
  const base = Math.round(wordCount * 0.12);
  const quality = payload.config.qualityLevel.includes("review") ? 1.65 : payload.config.qualityLevel.includes("patent") ? 1.35 : 1;
  const urgent = payload.config.isUrgent ? 1.25 : 1;
  const total = Math.round(base * quality * urgent);

  return (
    <StepShell title="Quote preview" description="This mock quote will become a persisted quote after submission.">
      <div className="grid gap-4 md:grid-cols-3">
        <Metric title="Word count" value={wordCount} />
        <Metric title="Estimated total" value={`$${total.toLocaleString()}`} />
        <Metric title="Delivery" value={payload.config.deliveryOption || "standard"} />
      </div>
      <div className="rounded-md border p-4 text-sm text-muted-foreground">
        Based on {payload.config.sourceLanguage} to {payload.config.targetLanguage}, {payload.config.qualityLevel}, and {payload.config.isUrgent ? "urgent" : "standard"} handling.
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
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {props.options.map((option) => (
            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}
