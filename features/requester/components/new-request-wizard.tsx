"use client";

import { CircleHelp, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { CSSProperties, ReactNode } from "react";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  saveRequestDraft,
  submitNegotiationFromWizard,
  submitRequestFromWizard,
} from "@/features/requester/actions";
import type {
  WizardConfig,
  WizardDraftSession,
  WizardPatentCandidate,
  WizardPayload,
  WizardSourceMode,
  WizardUploadedFile,
} from "@/features/requester/wizard-types";
import { ConfigStep, QuoteStepContent } from "./new-request-review-steps";
import { BasicsStep, PatentDetailStep, SourceStep } from "./new-request-source-steps";
import {
  buildWizardPayload,
  defaultWizardConfig,
  toWizardFormData,
  validateWizardPayload,
  validateWizardStep,
  wizardSteps,
} from "./new-request-wizard-utils";
import { useRequestWizardController } from "./requester-create-request-controller";

type WizardNegotiationDraft = {
  adjustmentNotes: string;
  expectedAmount: string;
  expectedDeliveryAt: string;
};

export function NewRequestWizard({
  initialDraft,
}: {
  initialDraft?: WizardDraftSession;
}) {
  const router = useRouter();
  const { registerController } = useRequestWizardController();
  const initialPayload = initialDraft?.payload;
  const initialConfig = {
    ...defaultWizardConfig,
    ...initialPayload?.config,
  };
  const [requestId, setRequestId] = useState<string | undefined>(initialDraft?.requestId);
  const [step, setStep] = useState(resolveInitialStep(initialPayload?.lastStep));
  const [title, setTitle] = useState(initialPayload?.title ?? "");
  const [sourceMode, setSourceMode] = useState<WizardSourceMode>(initialPayload?.sourceMode ?? "patent_search");
  const [patentQuery, setPatentQuery] = useState(initialPayload?.patentQuery ?? "");
  const [candidates, setCandidates] = useState<WizardPatentCandidate[]>([]);
  const [selectedPatent, setSelectedPatent] = useState<WizardPatentCandidate | undefined>(initialPayload?.selectedPatent);
  const [selectedPatentFileIds, setSelectedPatentFileIds] = useState<string[]>(initialPayload?.selectedPatentFileIds ?? []);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [uploadedFileSnapshots, setUploadedFileSnapshots] = useState<WizardUploadedFile[]>(initialPayload?.uploadedFiles ?? []);
  const [config, setConfig] = useState<WizardConfig>(initialConfig);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [negotiationOpen, setNegotiationOpen] = useState(false);
  const [negotiationDraft, setNegotiationDraft] = useState<WizardNegotiationDraft>({
    adjustmentNotes: "",
    expectedAmount: "",
    expectedDeliveryAt: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [stepLoadingMessage, setStepLoadingMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const isBusy = isPending || stepLoadingMessage !== null;
  const payload = buildPayload();
  const isDirty = step > 0
    || title.trim().length > 0
    || patentQuery.trim().length > 0
    || candidates.length > 0
    || selectedPatent !== undefined
    || selectedPatentFileIds.length > 0
    || uploadedFiles.length > 0
    || uploadedFileSnapshots.length > 0
    || JSON.stringify(config) !== JSON.stringify(defaultWizardConfig);

  function buildPayload(): WizardPayload {
    return buildWizardPayload({
      requestId,
      title,
      sourceMode,
      patentQuery,
      selectedPatent,
      selectedPatentFileIds,
      uploadedFiles,
      uploadedFileSnapshots,
      config,
      lastStep: wizardSteps[step].title,
    });
  }

  function handleConfigChange(nextConfig: WizardConfig) {
    setConfig(nextConfig);

    if (!error || step !== 3) {
      return;
    }

    const nextPayload = buildWizardPayload({
      requestId,
      title,
      sourceMode,
      patentQuery,
      selectedPatent,
      selectedPatentFileIds,
      uploadedFiles,
      uploadedFileSnapshots,
      config: nextConfig,
      lastStep: wizardSteps[step].title,
    });

    if (!validateWizardStep(step, nextPayload)) {
      setError(null);
    }
  }

  function goNext() {
    const validationError = validateWizardStep(step, payload);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);

    if (step === 3) {
      void runStepTransition("Parsing quote details", () => {
        setStep((current) => Math.min(current + 1, wizardSteps.length - 1));
      });
      return;
    }

    setStep((current) => Math.min(current + 1, wizardSteps.length - 1));
  }

  async function runStepTransition(message: string, action: () => void) {
    setStepLoadingMessage(message);

    try {
      await new Promise((resolve) => setTimeout(resolve, 900));
      action();
    } finally {
      setStepLoadingMessage(null);
    }
  }

  function buildNegotiationFormData() {
    const formData = toWizardFormData(payload, uploadedFiles);
    formData.set("expectedAmount", negotiationDraft.expectedAmount);
    formData.set("expectedDeliveryAt", negotiationDraft.expectedDeliveryAt);
    formData.set("adjustmentNotes", negotiationDraft.adjustmentNotes);
    return formData;
  }

  function handleStartNegotiation() {
    void persist(submitNegotiationFromWizard, {
      buildFormData: buildNegotiationFormData,
      redirectOnSuccess: false,
      onSuccess: (createdRequestId) => {
        setNegotiationOpen(false);
        router.push(`/requester/requests/${createdRequestId}/quote`);
      },
    });
  }

  function handleCancel() {
    if (!isDirty) {
      router.push("/requester");
      return;
    }

    setCancelOpen(true);
  }

  function resetWizard() {
    setRequestId(undefined);
    setStep(0);
    setTitle("");
    setSourceMode("patent_search");
    setPatentQuery("");
    setCandidates([]);
    setSelectedPatent(undefined);
    setSelectedPatentFileIds([]);
    setUploadedFiles([]);
    setUploadedFileSnapshots([]);
    setConfig(defaultWizardConfig);
    setCancelOpen(false);
    setNegotiationOpen(false);
    setNegotiationDraft({
      adjustmentNotes: "",
      expectedAmount: "",
      expectedDeliveryAt: "",
    });
    setError(null);
  }

  function persist(
    action:
      | typeof saveRequestDraft
      | typeof submitRequestFromWizard
      | typeof submitNegotiationFromWizard,
    options?: {
      buildFormData?: () => FormData;
      redirectOnSuccess?: boolean;
      onSuccess?: (requestId: string) => void;
    },
  ) {
    const validationError =
      action === saveRequestDraft ? null : validateWizardPayload(payload);
    if (validationError) {
      setError(validationError);
      return Promise.resolve(false);
    }

    return new Promise<boolean>((resolve) => {
      startTransition(async () => {
        const formData =
          options?.buildFormData?.() ?? toWizardFormData(payload, uploadedFiles);
        const result = await action(formData);
        setError(result.error ?? null);

        if (result.data?.requestId) {
          setRequestId(result.data.requestId);
          options?.onSuccess?.(result.data.requestId);
          if (options?.redirectOnSuccess !== false) {
            router.push(`/requester/requests/${result.data.requestId}`);
          }
          resolve(true);
          return;
        }

        resolve(false);
      });
    });
  }

  useEffect(() => {
    registerController({
      isDirty,
      resetToStart: resetWizard,
      saveDraftAndReset: async () => {
        const saved = await persist(saveRequestDraft, { redirectOnSuccess: false });
        if (saved) {
          resetWizard();
        }
        return saved;
      },
    });

    return () => registerController(null);
  }, [
    config,
    isDirty,
    patentQuery,
    candidates,
    selectedPatent,
    selectedPatentFileIds,
    step,
    title,
    uploadedFiles,
    uploadedFileSnapshots,
    registerController,
  ]);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-5 overflow-hidden">
      <StepNav currentStep={step} />
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
          <div className="flex min-h-0 flex-1 flex-col p-6">
            <StepContent
              step={step}
              title={title}
              sourceMode={sourceMode}
              patentQuery={patentQuery}
              candidates={candidates}
              selectedPatent={selectedPatent}
              selectedPatentFileIds={selectedPatentFileIds}
              uploadedFiles={uploadedFiles}
              uploadedFileSnapshots={uploadedFileSnapshots}
              config={config}
              payload={payload}
              isPending={isBusy}
              setTitle={setTitle}
              setSourceMode={setSourceMode}
              setPatentQuery={setPatentQuery}
              setCandidates={setCandidates}
              setSelectedPatent={setSelectedPatent}
              setPatentTransition={async (candidate) => {
                await runStepTransition("Retrieving patent information", () => {
                  setSelectedPatent(candidate);
                  setSelectedPatentFileIds([]);
                  setStep(2);
                });
              }}
              setSelectedPatentFileIds={setSelectedPatentFileIds}
              setUploadedFiles={(files) => {
                setUploadedFiles(files);
                setUploadedFileSnapshots(files.map((file) => ({
                  name: file.name,
                  size: file.size,
                  type: file.type,
                })));
              }}
              setConfig={handleConfigChange}
              setStep={setStep}
              quoteAction={
                <TooltipProvider delayDuration={120}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          setError(null);
                          setNegotiationOpen(true);
                        }}
                      >
                        <CircleHelp className="h-4 w-4" />
                        <span className="sr-only">Start negotiation</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Start negotiation</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              }
            />
          </div>
        </CardContent>
      </Card>
      {error ? <p className="shrink-0 text-sm text-destructive">{error}</p> : null}
      <WizardFooter
        step={step}
        isPending={isBusy}
        onCancel={handleCancel}
        onPrevious={() => setStep((current) => current - 1)}
        onNext={goNext}
        onSubmit={() => {
          void persist(submitRequestFromWizard);
        }}
      />
      <NegotiationDialog
        open={negotiationOpen}
        isPending={isBusy}
        value={negotiationDraft}
        onOpenChange={setNegotiationOpen}
        onChange={setNegotiationDraft}
        onSubmit={handleStartNegotiation}
      />
      <CancelDialog
        open={cancelOpen}
        isPending={isBusy}
        onOpenChange={setCancelOpen}
        onDiscard={() => router.push("/requester")}
        onSaveDraft={() => {
          void persist(saveRequestDraft, {
            redirectOnSuccess: false,
            onSuccess: (savedRequestId) => {
              router.push(`/requester/drafts/${savedRequestId}`);
            },
          });
        }}
      />
      <StepLoadingOverlay message={stepLoadingMessage} />
    </div>
  );
}

function resolveInitialStep(lastStep?: string) {
  if (!lastStep) {
    return 0;
  }

  const normalizedStep = lastStep === "Parse" ? "Patent Detail" : lastStep;
  const index = wizardSteps.findIndex((item) => item.title === normalizedStep);
  return index >= 0 ? index : 0;
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
  uploadedFileSnapshots: WizardUploadedFile[];
  config: WizardConfig;
  payload: WizardPayload;
  quoteAction?: ReactNode;
  isPending: boolean;
  setTitle: (value: string) => void;
  setSourceMode: (value: WizardSourceMode) => void;
  setPatentQuery: (value: string) => void;
  setCandidates: (value: WizardPatentCandidate[]) => void;
  setSelectedPatent: (value: WizardPatentCandidate) => void;
  setPatentTransition: (value: WizardPatentCandidate) => Promise<void>;
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
        uploadedFileSnapshots={props.uploadedFileSnapshots}
        isPending={props.isPending}
        onPatentQueryChange={props.setPatentQuery}
        onPatentSearch={props.setCandidates}
        onPatentSelect={(candidate) => {
          void props.setPatentTransition(candidate);
        }}
        onFilesChange={props.setUploadedFiles}
      />
    );
  }
  if (props.step === 2) {
    return (
      <PatentDetailStep
        sourceMode={props.sourceMode}
        payload={props.payload}
        patent={props.selectedPatent}
        uploadedFiles={props.uploadedFiles}
        uploadedFileSnapshots={props.uploadedFileSnapshots}
        selectedFileIds={props.selectedPatentFileIds}
        onSelectionChange={props.setSelectedPatentFileIds}
      />
    );
  }
  if (props.step === 3) return <ConfigStep config={props.config} onChange={props.setConfig} />;
  return <QuoteStepContent payload={props.payload} action={props.quoteAction} />;
}

function StepNav({ currentStep }: { currentStep: number }) {
  const current = wizardSteps[currentStep];
  const progress = ((currentStep + 1) / wizardSteps.length) * 100;

  return (
    <div className="shrink-0 rounded-md border bg-card p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em]">
            Step {currentStep + 1} of {wizardSteps.length}
          </p>
          <p className="mt-2 text-lg font-medium">{current.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{current.description}</p>
        </div>
        <p className="text-sm font-medium text-muted-foreground">
          {Math.round(progress)}%
        </p>
      </div>
      <div
        className="mt-4 h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress)}
      >
        <div
          className="h-full origin-left rounded-full bg-primary transition-[width] duration-200 ease-out"
          style={{ "--wizard-progress": `${progress}%`, width: "var(--wizard-progress)" } as CSSProperties}
        />
      </div>
    </div>
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
    <div className="flex shrink-0 items-center justify-between bg-background/95 pt-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <Button type="button" variant="outline" disabled={props.isPending} onClick={props.onCancel}>Cancel</Button>
      <div className="flex gap-2">
        {props.step > 0 ? <Button type="button" variant="outline" disabled={props.isPending} onClick={props.onPrevious}>Previous</Button> : null}
        {props.step < wizardSteps.length - 1 ? (
          <Button type="button" disabled={props.isPending} onClick={props.onNext}>Next</Button>
        ) : (
          <Button type="button" disabled={props.isPending} onClick={props.onSubmit}>
            {props.isPending ? "Submitting..." : "Submit Request"}
          </Button>
        )}
      </div>
    </div>
  );
}

function StepLoadingOverlay({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm">
      <div className="flex min-w-[320px] items-center gap-4 rounded-2xl border bg-card px-6 py-5 shadow-lg">
        <Loader2 className="h-5 w-5 animate-spin text-foreground" />
        <p className="text-sm font-medium text-foreground">{message}</p>
      </div>
    </div>
  );
}

function NegotiationDialog(props: {
  open: boolean;
  isPending: boolean;
  value: WizardNegotiationDraft;
  onOpenChange: (open: boolean) => void;
  onChange: (value: WizardNegotiationDraft) => void;
  onSubmit: () => void;
}) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start negotiation</DialogTitle>
          <DialogDescription>
            Submit the request and immediately move it into negotiation if you
            need pricing or delivery adjustments.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="wizardExpectedAmount">Expected price</Label>
            <Input
              id="wizardExpectedAmount"
              type="number"
              min="0"
              step="1"
              value={props.value.expectedAmount}
              onChange={(event) =>
                props.onChange({
                  ...props.value,
                  expectedAmount: event.target.value,
                })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="wizardExpectedDeliveryAt">
              Expected delivery date
            </Label>
            <Input
              id="wizardExpectedDeliveryAt"
              type="date"
              value={props.value.expectedDeliveryAt}
              onChange={(event) =>
                props.onChange({
                  ...props.value,
                  expectedDeliveryAt: event.target.value,
                })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="wizardAdjustmentNotes">Adjustment notes</Label>
            <Input
              id="wizardAdjustmentNotes"
              value={props.value.adjustmentNotes}
              onChange={(event) =>
                props.onChange({
                  ...props.value,
                  adjustmentNotes: event.target.value,
                })
              }
              placeholder="Scope, delivery, or pricing adjustment"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={props.isPending}
            onClick={() => props.onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={props.isPending}
            onClick={props.onSubmit}
          >
            {props.isPending ? "Submitting..." : "Submit negotiation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
