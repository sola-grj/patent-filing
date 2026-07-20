"use client";

import { CircleHelp, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { ReactNode } from "react";
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
  WizardDictionaries,
  WizardPatentCandidate,
  WizardPayload,
  WizardSourceMode,
  WizardUploadedFile,
} from "@/features/requester/wizard-types";
import { ConfigStep, QuoteStepContent } from "./new-request-review-steps";
import { SourceStep } from "./new-request-source-steps";
import {
  buildWizardPayload,
  defaultWizardConfig,
  normalizeWizardConfig,
  toWizardFormData,
  type WizardConfigFieldErrors,
  validateWizardConfigFields,
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
  dictionaries,
}: {
  initialDraft?: WizardDraftSession;
  dictionaries: WizardDictionaries;
}) {
  const router = useRouter();
  const { registerController } = useRequestWizardController();
  const initialPayload = initialDraft?.payload;
  const initialConfig = normalizeWizardConfig(initialPayload?.config);
  const [requestId, setRequestId] = useState<string | undefined>(initialDraft?.requestId);
  const [step, setStep] = useState(resolveInitialStep(initialPayload?.lastStep));
  const [sourceMode, setSourceMode] = useState<WizardSourceMode>(initialPayload?.sourceMode ?? "patent_search");
  const [patentQuery, setPatentQuery] = useState(initialPayload?.patentQuery ?? "");
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
  const [showConfigValidation, setShowConfigValidation] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stepLoadingMessage, setStepLoadingMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const isBusy = isPending || stepLoadingMessage !== null;
  const payload = buildPayload();
  const configFieldErrors =
    step === 1 && showConfigValidation ? validateWizardConfigFields(config) : {};
  const isDirty = step > 0
    || patentQuery.trim().length > 0
    || selectedPatent !== undefined
    || selectedPatentFileIds.length > 0
    || uploadedFiles.length > 0
    || uploadedFileSnapshots.length > 0
    || JSON.stringify(config) !== JSON.stringify(defaultWizardConfig);

  function applyUploadedFiles(nextFiles: File[]) {
    setUploadedFiles(nextFiles);
    setUploadedFileSnapshots(nextFiles.map((file) => ({
      name: file.name,
      size: file.size,
      type: file.type,
    })));
  }

  function clearSourceState() {
    setPatentQuery("");
    setSelectedPatent(undefined);
    setSelectedPatentFileIds([]);
    setUploadedFiles([]);
    setUploadedFileSnapshots([]);
    clearStepError(0);
  }

  function applyPatentSearchResult(candidate: WizardPatentCandidate) {
    setSelectedPatent(candidate);
    setSelectedPatentFileIds(candidate.downloadableFiles.map((file) => file.id));
  }

  function clearPatentSearchResult() {
    setSelectedPatent(undefined);
    setSelectedPatentFileIds([]);
  }

  function buildPayload(): WizardPayload {
    return buildWizardPayload({
      requestId,
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

  function clearStepError(targetStep?: number) {
    if (!error) {
      return;
    }

    if (targetStep !== undefined && step !== targetStep) {
      return;
    }

    setError(null);
  }

  function handleConfigChange(nextConfig: WizardConfig) {
    setConfig(nextConfig);
  }

  function goNext() {
    if (step === 0 && sourceMode === "patent_search") {
      if (!selectedPatent) {
        setError("Search for a patent before continuing.");
        return;
      }

    }

    const validationError = validateWizardStep(step, payload);
    if (validationError) {
      if (step === 1) {
        setShowConfigValidation(true);
        setError(null);
      } else {
        setError(validationError);
      }
      return;
    }
    setShowConfigValidation(false);
    setError(null);

    if (step === 1) {
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
    setSourceMode("patent_search");
    setPatentQuery("");
    setSelectedPatent(undefined);
    setSelectedPatentFileIds([]);
    setUploadedFiles([]);
    setUploadedFileSnapshots([]);
    setConfig(defaultWizardConfig);
    setShowConfigValidation(false);
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
    selectedPatent,
    selectedPatentFileIds,
    step,
    uploadedFiles,
    uploadedFileSnapshots,
    registerController,
  ]);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-5 overflow-hidden">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Card className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
          <CardContent className="grid h-full min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto] overflow-hidden p-0">
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-6">
              <StepContent
                step={step}
                sourceMode={sourceMode}
                patentQuery={patentQuery}
                selectedPatent={selectedPatent}
                uploadedFiles={uploadedFiles}
                uploadedFileSnapshots={uploadedFileSnapshots}
                config={config}
                configFieldErrors={configFieldErrors}
                payload={payload}
                isPending={isBusy}
                setSourceMode={(value) => {
                  clearStepError(0);
                  setSourceMode(value);
                }}
                setPatentQuery={(value) => {
                  clearStepError(0);
                  setPatentQuery(value);
                }}
                setPatentSearchResult={(value) => {
                  clearStepError(0);
                  applyPatentSearchResult(value);
                }}
                clearPatentSearchResult={clearPatentSearchResult}
                clearSourceState={clearSourceState}
                setUploadedFiles={(value) => {
                  clearStepError(0);
                  applyUploadedFiles(value);
                }}
                removeUploadedFile={(index) => {
                  if (uploadedFiles.length) {
                    const nextFiles = uploadedFiles.filter((_, fileIndex) => fileIndex !== index);
                    applyUploadedFiles(nextFiles);
                    return;
                  }

                  setUploadedFileSnapshots((current) =>
                    current.filter((_, fileIndex) => fileIndex !== index),
                  );
                }}
                setConfig={handleConfigChange}
                dictionaries={dictionaries}
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
            <div className="shrink-0 px-6 py-4">
              {error ? <p className="mb-3 text-sm text-destructive">{error}</p> : null}
              <WizardFooter
                step={step}
                nextLabel={
                  step === 1
                    ? "Generate Estimate"
                    : "Next"
                }
                isPending={isBusy}
                onCancel={handleCancel}
                onPrevious={() => setStep((current) => current - 1)}
                onNext={goNext}
                onSubmit={() => {
                  void persist(submitRequestFromWizard);
                }}
              />
            </div>
          </CardContent>
        </Card>
      </div>
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

  const normalizedStep = lastStep === "Basics" || lastStep === "Source"
    ? "Source"
    : lastStep === "Parse" || lastStep === "Patent Detail"
      ? "Source"
      : lastStep;
  const index = wizardSteps.findIndex((item) => item.title === normalizedStep);
  return index >= 0 ? index : 0;
}

function StepContent(props: {
  step: number;
  sourceMode: WizardSourceMode;
  patentQuery: string;
  selectedPatent?: WizardPatentCandidate;
  uploadedFiles: File[];
  uploadedFileSnapshots: WizardUploadedFile[];
  config: WizardConfig;
  dictionaries: WizardDictionaries;
  configFieldErrors: WizardConfigFieldErrors;
  payload: WizardPayload;
  quoteAction?: ReactNode;
  isPending: boolean;
  setSourceMode: (value: WizardSourceMode) => void;
  setPatentQuery: (value: string) => void;
  setPatentSearchResult: (value: WizardPatentCandidate) => void;
  clearPatentSearchResult: () => void;
  clearSourceState: () => void;
  setUploadedFiles: (value: File[]) => void;
  removeUploadedFile: (index: number) => void;
  setConfig: (value: WizardConfig) => void;
}) {
  if (props.step === 0) {
    return (
      <SourceStep
        sourceMode={props.sourceMode}
        channelCode={props.config.channelCode}
        patentQuery={props.patentQuery}
        patent={props.selectedPatent}
        uploadedFiles={props.uploadedFiles}
        uploadedFileSnapshots={props.uploadedFileSnapshots}
        isPending={props.isPending}
        onChannelChange={(value) => {
          if (props.sourceMode !== "patent_search" || props.config.channelCode !== value) {
            props.clearSourceState();
          }
          props.setConfig({ ...props.config, channelCode: value });
        }}
        onSourceModeChange={(value) => {
          const activeRoute = props.sourceMode === "upload"
            ? "upload_files"
            : props.config.channelCode;
          const nextRoute = value === "upload" ? "upload_files" : props.config.channelCode;
          if (activeRoute !== nextRoute) {
            props.clearSourceState();
          }
          props.setSourceMode(value);
        }}
        onPatentQueryChange={props.setPatentQuery}
        onPatentSearch={props.setPatentSearchResult}
        onPatentSearchStart={props.clearPatentSearchResult}
        onFilesChange={props.setUploadedFiles}
        onRemoveFile={props.removeUploadedFile}
      />
    );
  }
  if (props.step === 1) {
    return (
      <ConfigStep
        config={props.config}
        configFieldErrors={props.configFieldErrors}
        sourceMode={props.sourceMode}
        patentNumber={
          props.sourceMode === "patent_search"
            ? props.selectedPatent?.patentNumber ?? props.patentQuery
            : undefined
        }
        onChange={props.setConfig}
        dictionaries={props.dictionaries}
      />
    );
  }
  return (
    <QuoteStepContent
      payload={props.payload}
      action={props.quoteAction}
      dictionaries={props.dictionaries}
    />
  );
}

function WizardFooter(props: {
  step: number;
  nextLabel?: string;
  isPending: boolean;
  onCancel: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center justify-between">
      <Button type="button" variant="outline" disabled={props.isPending} onClick={props.onCancel}>Cancel</Button>
      <div className="flex gap-2">
        {props.step > 0 ? <Button type="button" variant="outline" disabled={props.isPending} onClick={props.onPrevious}>Previous</Button> : null}
        {props.step < wizardSteps.length - 1 ? (
          <Button type="button" disabled={props.isPending} onClick={props.onNext}>{props.nextLabel ?? "Next"}</Button>
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
          <AlertDialogDescription>You can keep editing or discard the wizard state.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep editing</AlertDialogCancel>
          <AlertDialogAction onClick={props.onDiscard}>Discard</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
