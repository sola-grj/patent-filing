"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  saveRequestDraft,
  submitRequestFromWizard,
} from "@/features/requester/actions";
import type {
  WizardConfig,
  WizardPatentCandidate,
  WizardPayload,
  WizardSourceMode,
} from "@/features/requester/wizard-types";
import { ConfigStep, ParseStep, QuoteStep } from "./new-request-review-steps";
import { BasicsStep, PatentDetailStep, SourceStep } from "./new-request-source-steps";
import {
  buildWizardPayload,
  defaultWizardConfig,
  toWizardFormData,
  validateWizardPayload,
  validateWizardStep,
  wizardSteps,
} from "./new-request-wizard-utils";

export function NewRequestWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState("");
  const [sourceMode, setSourceMode] = useState<WizardSourceMode>("patent_search");
  const [patentQuery, setPatentQuery] = useState("");
  const [candidates, setCandidates] = useState<WizardPatentCandidate[]>([]);
  const [selectedPatent, setSelectedPatent] = useState<WizardPatentCandidate | undefined>();
  const [selectedPatentFileIds, setSelectedPatentFileIds] = useState<string[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [config, setConfig] = useState<WizardConfig>(defaultWizardConfig);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const payload = buildPayload();

  function buildPayload(): WizardPayload {
    return buildWizardPayload({
      title,
      sourceMode,
      patentQuery,
      selectedPatent,
      selectedPatentFileIds,
      uploadedFiles,
      config,
      lastStep: wizardSteps[step].title,
    });
  }

  function goNext() {
    const validationError = validateWizardStep(step, payload);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setStep((current) => Math.min(current + 1, wizardSteps.length - 1));
  }

  function persist(action: typeof saveRequestDraft | typeof submitRequestFromWizard) {
    const validationError = action === submitRequestFromWizard ? validateWizardPayload(payload) : null;
    if (validationError) {
      setError(validationError);
      return;
    }

    startTransition(async () => {
      const result = await action(toWizardFormData(payload, uploadedFiles));
      setError(result.error ?? null);
      if (result.data?.requestId) {
        router.push(`/requester/requests/${result.data.requestId}`);
      }
    });
  }

  return (
    <div className="space-y-6">
      <StepNav currentStep={step} />
      <Card className="min-h-[520px]">
        <CardContent className="p-6">
          <StepContent
            step={step}
            title={title}
            sourceMode={sourceMode}
            patentQuery={patentQuery}
            candidates={candidates}
            selectedPatent={selectedPatent}
            selectedPatentFileIds={selectedPatentFileIds}
            uploadedFiles={uploadedFiles}
            config={config}
            payload={payload}
            isPending={isPending}
            setTitle={setTitle}
            setSourceMode={setSourceMode}
            setPatentQuery={setPatentQuery}
            setCandidates={setCandidates}
            setSelectedPatent={setSelectedPatent}
            setSelectedPatentFileIds={setSelectedPatentFileIds}
            setUploadedFiles={setUploadedFiles}
            setConfig={setConfig}
            setStep={setStep}
          />
          {error ? <p className="mt-6 text-sm text-destructive">{error}</p> : null}
        </CardContent>
      </Card>
      <WizardFooter
        step={step}
        isPending={isPending}
        onCancel={() => setCancelOpen(true)}
        onPrevious={() => setStep((current) => current - 1)}
        onNext={goNext}
        onSubmit={() => persist(submitRequestFromWizard)}
      />
      <CancelDialog
        open={cancelOpen}
        isPending={isPending}
        onOpenChange={setCancelOpen}
        onDiscard={() => router.push("/requester")}
        onSaveDraft={() => persist(saveRequestDraft)}
      />
    </div>
  );
}

function StepContent(props: {
  step: number;
  title: string;
  sourceMode: WizardSourceMode;
  patentQuery: string;
  candidates: WizardPatentCandidate[];
  selectedPatent?: WizardPatentCandidate;
  selectedPatentFileIds: string[];
  uploadedFiles: File[];
  config: WizardConfig;
  payload: WizardPayload;
  isPending: boolean;
  setTitle: (value: string) => void;
  setSourceMode: (value: WizardSourceMode) => void;
  setPatentQuery: (value: string) => void;
  setCandidates: (value: WizardPatentCandidate[]) => void;
  setSelectedPatent: (value: WizardPatentCandidate) => void;
  setSelectedPatentFileIds: (value: string[]) => void;
  setUploadedFiles: (value: File[]) => void;
  setConfig: (value: WizardConfig) => void;
  setStep: (value: number) => void;
}) {
  if (props.step === 0) {
    return <BasicsStep title={props.title} sourceMode={props.sourceMode} onTitleChange={props.setTitle} onSourceModeChange={props.setSourceMode} />;
  }
  if (props.step === 1) {
    return (
      <SourceStep
        sourceMode={props.sourceMode}
        patentQuery={props.patentQuery}
        candidates={props.candidates}
        uploadedFiles={props.uploadedFiles}
        isPending={props.isPending}
        onPatentQueryChange={props.setPatentQuery}
        onPatentSearch={props.setCandidates}
        onPatentSelect={(candidate) => {
          props.setSelectedPatent(candidate);
          props.setSelectedPatentFileIds([]);
          props.setStep(2);
        }}
        onFilesChange={props.setUploadedFiles}
      />
    );
  }
  if (props.step === 2) {
    return (
      <PatentDetailStep
        sourceMode={props.sourceMode}
        patent={props.selectedPatent}
        uploadedFiles={props.uploadedFiles}
        selectedFileIds={props.selectedPatentFileIds}
        onSelectionChange={props.setSelectedPatentFileIds}
        onBackToResults={() => props.setStep(1)}
      />
    );
  }
  if (props.step === 3) return <ParseStep payload={props.payload} />;
  if (props.step === 4) return <ConfigStep config={props.config} onChange={props.setConfig} />;
  return <QuoteStep payload={props.payload} />;
}

function StepNav({ currentStep }: { currentStep: number }) {
  return (
    <ol className="grid gap-3 md:grid-cols-6">
      {wizardSteps.map((item, index) => (
        <li key={item.title} className={`rounded-md border p-3 ${index === currentStep ? "border-foreground bg-foreground text-background" : "bg-card"}`}>
          <p className="text-xs font-semibold uppercase tracking-[0.16em]">Step {index + 1}</p>
          <p className="mt-2 font-medium">{item.title}</p>
          <p className={`mt-1 text-xs ${index === currentStep ? "text-background/70" : "text-muted-foreground"}`}>{item.description}</p>
        </li>
      ))}
    </ol>
  );
}

function WizardFooter(props: {
  step: number;
  isPending: boolean;
  onCancel: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <Button type="button" variant="outline" onClick={props.onCancel}>Cancel</Button>
      <div className="flex gap-2">
        {props.step > 0 ? <Button type="button" variant="outline" onClick={props.onPrevious}>Previous</Button> : null}
        {props.step < wizardSteps.length - 1 ? (
          <Button type="button" onClick={props.onNext}>Next</Button>
        ) : (
          <Button type="button" disabled={props.isPending} onClick={props.onSubmit}>
            {props.isPending ? "Submitting..." : "Submit Request"}
          </Button>
        )}
      </div>
    </div>
  );
}

function CancelDialog(props: {
  open: boolean;
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onDiscard: () => void;
  onSaveDraft: () => void;
}) {
  return (
    <AlertDialog open={props.open} onOpenChange={props.onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel this request?</AlertDialogTitle>
          <AlertDialogDescription>You can discard the wizard state or save it as a draft request.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep editing</AlertDialogCancel>
          <Button type="button" variant="outline" disabled={props.isPending} onClick={props.onSaveDraft}>Save draft</Button>
          <AlertDialogAction onClick={props.onDiscard}>Discard</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
