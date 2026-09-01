"use client";

import { Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { sourceLanguageOptions } from "@/features/requester/options";
import { validateUploadFiles } from "@/lib/validators/requester";
import {
  saveRequestDraft,
  generateErpEstimate,
  lookupPatentForWizard,
  submitNegotiationFromWizard,
  submitRequestFromWizard,
} from "@/features/requester/actions";
import {
  isErpQuoteCurrencyCode,
  type ErpQuoteCurrencyCode,
  type ErpQuotePreview,
} from "@/lib/eci-erp/types";
import type {
  WizardConfig,
  WizardDraftSession,
  WizardDictionaries,
  WizardPatentAnalysisStatus,
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
  hasUsablePatentAnalysis,
  normalizeWizardConfig,
  toWizardFormData,
  type WizardConfigFieldErrors,
  updateWizardChannel,
  validateWizardConfigFields,
  validateWizardPayload,
  validateWizardStep,
  wizardSteps,
} from "./new-request-wizard-utils";
import { useRequestWizardController } from "./requester-create-request-controller";
import { usePatentAnalysis } from "./use-patent-analysis";
import { PatentProcessingNotice } from "./patent-processing-notice";
import { PatentCacheWarning } from "./patent-cache-warning";
import type { RequestPathCode } from "../requester-routes";
import {
  shouldStartAutomaticPatentAnalysis,
} from "../epo-tifg-upload";

type WizardNegotiationDraft = {
  adjustmentNotes: string;
  expectedAmount: string;
  expectedDeliveryAt: string;
};

export function NewRequestWizard({
  initialDraft,
  initialPayload: seededPayload,
  initialPath,
  autoStartPatentSearch = false,
  skipSourceStep = false,
  dictionaries,
}: {
  initialDraft?: WizardDraftSession;
  initialPayload?: Partial<WizardPayload>;
  initialPath?: RequestPathCode;
  autoStartPatentSearch?: boolean;
  skipSourceStep?: boolean;
  dictionaries: WizardDictionaries;
}) {
  const router = useRouter();
  const { registerController } = useRequestWizardController();
  const isRestoredDraft = Boolean(initialDraft?.requestId);
  const initialPayload = initialDraft?.payload ?? seededPayload;
  const initialConfig = normalizeWizardConfig(
    initialPayload?.config ?? (initialPath ? { channelCode: initialPath } : undefined),
  );
  const analysis = usePatentAnalysis(initialPayload?.analysis);
  const analysisStatus = analysis.status;
  const startAnalysis = analysis.start;
  const [requestId, setRequestId] = useState<string | undefined>(initialDraft?.requestId);
  const [referenceNo, setReferenceNo] = useState(initialPayload?.referenceNo ?? "");
  const [step, setStep] = useState(
    isRestoredDraft
      ? 1
      : resolveInitialStep(initialPayload?.lastStep),
  );
  const [sourceMode, setSourceMode] = useState<WizardSourceMode>(initialPayload?.sourceMode ?? "patent_search");
  const [patentQuery, setPatentQuery] = useState(initialPayload?.patentQuery ?? "");
  const [selectedPatent, setSelectedPatent] = useState<WizardPatentCandidate | undefined>(initialPayload?.selectedPatent);
  const [uploadReference, setUploadReference] = useState<WizardPatentCandidate>();
  const [selectedPatentFileIds, setSelectedPatentFileIds] = useState<string[]>(initialPayload?.selectedPatentFileIds ?? []);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [uploadedFileSnapshots, setUploadedFileSnapshots] = useState<WizardUploadedFile[]>(initialPayload?.uploadedFiles ?? []);
  const [config, setConfig] = useState<WizardConfig>(initialConfig);
  const [quoteCurrency, setQuoteCurrency] = useState<ErpQuoteCurrencyCode>(
    isErpQuoteCurrencyCode(initialPayload?.quoteCurrency)
      ? initialPayload.quoteCurrency
      : "CNY",
  );
  const [quotePreview, setQuotePreview] = useState<ErpQuotePreview | null>(
    initialPayload?.quotePreview ?? null,
  );
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
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isPending, startTransition] = useTransition();
  const isBusy = isPending || isSavingDraft || stepLoadingMessage !== null;
  const payload = buildPayload();
  const hasUsableAnalysis = hasUsablePatentAnalysis(payload);
  const configFieldErrors =
    step === 1 && showConfigValidation
      ? validateWizardConfigFields(config, selectedPatent, analysis.result)
      : {};
  const isDirty = step > 0
    || referenceNo.trim().length > 0
    || patentQuery.trim().length > 0
    || selectedPatent !== undefined
    || selectedPatentFileIds.length > 0
    || uploadedFiles.length > 0
    || uploadedFileSnapshots.length > 0
    || JSON.stringify(config) !== JSON.stringify(defaultWizardConfig);
  const directSearchStarted = useRef(false);

  function applyUploadedFiles(nextFiles: File[]) {
    try {
      validateUploadFiles(nextFiles);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "The selected files could not be uploaded.",
      );
      return;
    }

    if (
      uploadedFiles.length > 0
      && haveSameUploadedFiles(uploadedFiles, nextFiles)
    ) {
      setError(null);
      return;
    }

    analysis.reset();
    setError(null);
    setUploadedFiles(nextFiles);
    setUploadedFileSnapshots(nextFiles.map((file) => ({
      name: file.name,
      size: file.size,
      type: file.type,
    })));
  }

  function applyTifgFiles(nextFiles: File[]) {
    if (nextFiles.length !== 1) {
      setError("Upload exactly one TIFG clean-copy PDF.");
      return;
    }
    if (
      !nextFiles[0].name.toLowerCase().endsWith(".pdf")
      || (nextFiles[0].type && nextFiles[0].type !== "application/pdf")
    ) {
      setError("The TIFG clean copy must be uploaded as a PDF.");
      return;
    }
    try {
      validateUploadFiles(nextFiles);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "The TIFG clean-copy PDF could not be uploaded.",
      );
      return;
    }

    setError(null);
    setUploadedFiles(nextFiles);
    setUploadedFileSnapshots(nextFiles.map((file) => ({
      name: file.name,
      size: file.size,
      type: file.type,
    })));
    analysis.reset();
    analysis.start({
      sourceMode: "upload",
      expectedPatentNumber: selectedPatent?.patentNumber
        || patentQuery,
      expectedDocumentKind: "tifg",
      files: nextFiles,
    });
  }

  function removeTifg() {
    setUploadedFiles([]);
    setUploadedFileSnapshots([]);
    analysis.reset();
    setError(null);
  }

  function clearSourceState() {
    analysis.reset();
    setPatentQuery("");
    setSelectedPatent(undefined);
    setUploadReference(undefined);
    setSelectedPatentFileIds([]);
    setUploadedFiles([]);
    setUploadedFileSnapshots([]);
    clearStepError(0);
  }

  function applyPatentSearchResult(candidate: WizardPatentCandidate) {
    const sourceLanguage = resolvePatentSourceLanguage(candidate);
    setUploadReference(undefined);
    setSelectedPatent(candidate);
    setUploadedFiles([]);
    setUploadedFileSnapshots([]);
    setSelectedPatentFileIds(candidate.downloadableFiles.map((file) => file.id));
    if (sourceLanguage) {
      setConfig((current) => current.sourceLanguage
        ? current
        : { ...current, sourceLanguage });
    }
    setStep(1);
  }

  function retryPatentAnalysis() {
    analysis.start({
      sourceMode: "patent_search",
      patentNumber: selectedPatent?.patentNumber ?? patentQuery,
      channelCode: config.channelCode,
      files: [],
    });
  }

  function retryCurrentAnalysis() {
    if (
      sourceMode === "patent_search"
      && config.epServiceType === "ep_granting"
    ) {
      if (uploadedFiles.length) {
        applyTifgFiles(uploadedFiles);
      } else {
        setError("Upload the TIFG clean-copy PDF to parse claims for EP Granting.");
      }
      return;
    }
    if (sourceMode === "upload") {
      analysis.start({
        sourceMode: "upload",
        patentNumber: selectedPatent?.patentNumber ?? patentQuery,
        files: uploadedFiles,
      });
      return;
    }

    retryPatentAnalysis();
  }

  function startPatentSearch() {
    analysis.reset();
    setSelectedPatent(undefined);
    setSelectedPatentFileIds([]);
    setUploadedFiles([]);
    setUploadedFileSnapshots([]);
    if (shouldStartAutomaticPatentAnalysis({
      channelCode: config.channelCode,
      epServiceType: config.epServiceType,
    })) {
      analysis.start({
        sourceMode: "patent_search",
        patentNumber: patentQuery,
        channelCode: config.channelCode,
        files: [],
      });
    }
  }

  function failPatentSearch() {
    analysis.reset();
    setSelectedPatent(undefined);
    setSelectedPatentFileIds([]);
  }

  const startPatentSearchRef = useRef(startPatentSearch);
  const failPatentSearchRef = useRef(failPatentSearch);
  startPatentSearchRef.current = startPatentSearch;
  failPatentSearchRef.current = failPatentSearch;

  useEffect(() => {
    if (
      !skipSourceStep
      || !autoStartPatentSearch
      || directSearchStarted.current
      || sourceMode !== "patent_search"
      || !patentQuery.trim()
    ) {
      return;
    }

    directSearchStarted.current = true;
    setError(null);
    setStepLoadingMessage("Parsing patent details");
    startPatentSearchRef.current();

    void (async () => {
      try {
        const formData = new FormData();
        formData.set("patentQuery", patentQuery);
        formData.set("channelCode", config.channelCode);
        const result = await lookupPatentForWizard(formData);

        if (result.data?.patent) {
          applyPatentSearchResult(result.data.patent);
          return;
        }

        failPatentSearchRef.current();
        setError(result.error || "No patent data was found. Check the patent number and try again.");
      } catch {
        failPatentSearchRef.current();
        setError("Patent search failed. Please try again later.");
      } finally {
        setStepLoadingMessage(null);
      }
    })();
  }, [
    autoStartPatentSearch,
    config.channelCode,
    patentQuery,
    skipSourceStep,
    sourceMode,
  ]);

  function switchMissingPatentToUpload() {
    if (!selectedPatent) return;
    analysis.reset();
    setUploadReference(selectedPatent);
    setSelectedPatent(undefined);
    setSelectedPatentFileIds([]);
    setPatentQuery("");
    setSourceMode("upload");
    setStep(0);
    setError(null);
  }

  function buildPayload(): WizardPayload {
    return buildWizardPayload({
      requestId,
      referenceNo,
      sourceMode,
      patentQuery,
      selectedPatent,
      selectedPatentFileIds,
      uploadedFiles,
      uploadedFileSnapshots,
      analysis: analysis.result,
      quoteCurrency,
      quotePreview: quotePreview ?? undefined,
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
    const normalizedConfig = normalizeWizardConfig(nextConfig);
    setQuotePreview(null);
    const grantingSourceChanged = sourceMode === "patent_search"
      && (
        config.epServiceType === "ep_granting"
        || normalizedConfig.epServiceType === "ep_granting"
      )
      && (
        normalizedConfig.epServiceType !== config.epServiceType
        || normalizedConfig.translationRequired !== config.translationRequired
      );
    if (grantingSourceChanged) {
      setUploadedFiles([]);
      setUploadedFileSnapshots([]);
      analysis.reset();
    }
    setConfig(normalizedConfig);
  }

  async function handleQuoteCurrencyChange(nextCurrency: ErpQuoteCurrencyCode) {
    if (nextCurrency === quoteCurrency || !quotePreview) return;
    setStepLoadingMessage(`Recalculating estimate in ${nextCurrency}`);
    setError(null);
    try {
      const result = await generateErpEstimate({
        ...payload,
        quoteCurrency: nextCurrency,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      setQuoteCurrency(nextCurrency);
      setQuotePreview(result.data);
    } finally {
      setStepLoadingMessage(null);
    }
  }

  async function handleQuoteDownload(format: "pdf" | "xlsx") {
    if (!quotePreview || isBusy) return;
    setStepLoadingMessage(`Preparing ${format === "pdf" ? "PDF" : "Excel"} quotation`);
    setError(null);
    try {
      const response = await fetch(`/api/requester/quotes/export?format=${format}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(result?.error ?? `Unable to export the estimate (${response.status}).`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = responseFileName(response.headers.get("content-disposition"))
        ?? `Pat-estimate.${format}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (downloadError) {
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : "Unable to export the estimate.",
      );
    } finally {
      setStepLoadingMessage(null);
    }
  }

  async function goNext() {
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

    if (step === 0 && sourceMode === "upload") {
      analysis.start({
        sourceMode,
        patentNumber: selectedPatent?.patentNumber ?? patentQuery,
        files: uploadedFiles,
      });
    }

    if (step === 1) {
      if (!hasUsableAnalysis) {
        setError(
          analysis.error
            ?? "The effective patent document must parse successfully before the estimate can be generated.",
        );
        return;
      }

      setStepLoadingMessage("Requesting live estimate");
      try {
        const result = await generateErpEstimate(payload);
        if (!result.success) {
          setError(result.error);
          return;
        }
        setQuotePreview(result.data);
        setStep((current) => Math.min(current + 1, wizardSteps.length - 1));
      } finally {
        setStepLoadingMessage(null);
      }
      return;
    }

    setStep((current) => Math.min(current + 1, wizardSteps.length - 1));
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

  async function handleSaveDraft() {
    setIsSavingDraft(true);
    setStepLoadingMessage(
      sourceMode === "patent_search" && selectedPatent
        ? "Saving official document and verified analysis"
        : "Saving draft",
    );
    try {
      await persist(saveRequestDraft, {
        redirectOnSuccess: false,
        onSuccess: () => {
          setCancelOpen(false);
          router.push("/requester/drafts");
        },
      });
    } finally {
      setIsSavingDraft(false);
      setStepLoadingMessage(null);
    }
  }

  function resetWizard() {
    analysis.reset();
    setStepLoadingMessage(null);
    setRequestId(undefined);
    setReferenceNo("");
    setStep(0);
    setSourceMode("patent_search");
    setPatentQuery("");
    setSelectedPatent(undefined);
    setUploadReference(undefined);
    setSelectedPatentFileIds([]);
    setUploadedFiles([]);
    setUploadedFileSnapshots([]);
    setConfig(defaultWizardConfig);
    setQuoteCurrency("CNY");
    setQuotePreview(null);
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
        }
        if (!result.success) {
          resolve(false);
          return;
        }
        if (result.data?.requestId) {
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

  const resetWizardRef = useRef(resetWizard);
  const persistRef = useRef(persist);
  resetWizardRef.current = resetWizard;
  persistRef.current = persist;

  useEffect(() => {
    if (
      sourceMode === "patent_search"
      && selectedPatent
      && analysisStatus === "idle"
      && !isRestoredDraft
      && shouldStartAutomaticPatentAnalysis({
        channelCode: config.channelCode,
        epServiceType: config.epServiceType,
      })
    ) {
      startAnalysis({
        sourceMode,
        patentNumber: selectedPatent.patentNumber,
        channelCode: config.channelCode,
        files: [],
      });
    }
  }, [
    analysisStatus,
    config.channelCode,
    config.epServiceType,
    selectedPatent,
    isRestoredDraft,
    sourceMode,
    startAnalysis,
  ]);

  useEffect(() => {
    registerController({
      isDirty,
      resetToStart: () => resetWizardRef.current(),
      saveDraftAndReset: async () => {
        const saved = await persistRef.current(
          saveRequestDraft,
          { redirectOnSuccess: false },
        );
        if (saved) {
          resetWizardRef.current();
        }
        return saved;
      },
    });

    return () => registerController(null);
  }, [isDirty, registerController]);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-5 overflow-hidden">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Card className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
          <CardContent className="grid h-full min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto] overflow-hidden p-0">
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-6">
              <StepContent
                step={step}
                sourceMode={sourceMode}
                referenceNo={referenceNo}
                patentQuery={patentQuery}
                autoStartPatentSearch={autoStartPatentSearch}
                selectedPatent={selectedPatent}
                uploadedFiles={uploadedFiles}
                uploadedFileSnapshots={uploadedFileSnapshots}
                uploadReference={uploadReference}
                config={config}
                configFieldErrors={configFieldErrors}
                payload={payload}
                quotePreview={quotePreview}
                quoteCurrency={quoteCurrency}
                analysisStatus={analysis.status}
                analysisResult={analysis.result}
                analysisError={analysis.error}
                onAnalysisRetry={retryCurrentAnalysis}
                isPending={isBusy}
                setSourceMode={(value) => {
                  clearStepError(0);
                  setSourceMode(value);
                }}
                setPatentQuery={(value) => {
                  clearStepError(0);
                  setPatentQuery(value);
                }}
                setReferenceNo={(value) => {
                  clearStepError(0);
                  setReferenceNo(value);
                }}
                setPatentSearchResult={(value) => {
                  clearStepError(0);
                  applyPatentSearchResult(value);
                }}
                startPatentSearch={startPatentSearch}
                failPatentSearch={failPatentSearch}
                setPatentSearchLoadingMessage={setStepLoadingMessage}
                clearSourceState={clearSourceState}
                setUploadedFiles={(value) => {
                  clearStepError(0);
                  applyUploadedFiles(value);
                }}
                setTifgFiles={applyTifgFiles}
                removeTifg={removeTifg}
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
                onQuoteCurrencyChange={(currency) => {
                  void handleQuoteCurrencyChange(currency);
                }}
                dictionaries={dictionaries}
                quoteAction={
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
                        disabled={!quotePreview || isBusy}
                      >
                        <Download className="h-4 w-4" />
                        <span className="sr-only">Download quotation</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => { void handleQuoteDownload("pdf"); }}>
                        <FileText />
                        PDF
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => { void handleQuoteDownload("xlsx"); }}>
                        <FileSpreadsheet />
                        Excel
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                }
              />
            </div>
            <div className="shrink-0 px-6 py-4">
              {step === 1 ? (
                <div className="mb-3 space-y-3">
                  {sourceMode === "patent_search" && selectedPatent?.dataOrigin === "cache_fallback" ? (
                    <PatentCacheWarning />
                  ) : null}
                  {analysis.status !== "idle" && config.epServiceType !== "ep_granting" ? (
                    <PatentProcessingNotice
                      status={analysis.status}
                      result={analysis.result}
                      error={analysis.error}
                      onRetry={retryCurrentAnalysis}
                    />
                  ) : null}
                  {sourceMode === "patent_search" && analysis.errorCode === "original_file_not_available" ? (
                    <div className="flex flex-col gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between">
                      <p>
                        EPO returned the patent details, but the complete original
                        document is unavailable. Upload the source files to continue.
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        className="shrink-0 border-amber-400 bg-white"
                        onClick={switchMissingPatentToUpload}
                      >
                        Switch to Upload Files
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {error ? <p className="mb-3 text-sm text-destructive">{error}</p> : null}
              <WizardFooter
                step={step}
                minimumStep={isRestoredDraft ? 1 : 0}
                nextLabel={
                  step === 1
                    ? "Generate Estimate"
                    : "Next"
                }
                isPending={isBusy}
                nextDisabled={
                  step === 1
                  && !hasUsableAnalysis
                }
                submitDisabled={
                  !hasUsableAnalysis
                }
                onCancel={handleCancel}
                onPrevious={() => setStep((current) => Math.max(
                  current - 1,
                  isRestoredDraft ? 1 : 0,
                ))}
                onNext={() => { void goNext(); }}
                onSubmit={() => {
                  void persist(submitRequestFromWizard);
                }}
                pendingLabel="Submitting request..."
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
        isSavingDraft={isSavingDraft}
        onOpenChange={setCancelOpen}
        onDiscard={() => router.push("/requester")}
        onSaveDraft={() => {
          void handleSaveDraft();
        }}
      />
      <StepLoadingOverlay message={stepLoadingMessage} />
    </div>
  );
}

function haveSameUploadedFiles(currentFiles: File[], nextFiles: File[]) {
  if (currentFiles.length !== nextFiles.length) {
    return false;
  }

  const currentKeys = currentFiles.map(uploadedFileIdentity).sort();
  const nextKeys = nextFiles.map(uploadedFileIdentity).sort();
  return currentKeys.every((key, index) => key === nextKeys[index]);
}

function uploadedFileIdentity(file: File) {
  return JSON.stringify([
    file.name,
    file.size,
    file.type,
    file.lastModified,
  ]);
}

function responseFileName(contentDisposition: string | null) {
  if (!contentDisposition) return null;
  const encoded = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) return decodeURIComponent(encoded);
  return contentDisposition.match(/filename="([^"]+)"/i)?.[1] ?? null;
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

function resolvePatentSourceLanguage(candidate: WizardPatentCandidate) {
  const rawProceduralLanguage = candidate.sourceSnapshot?.procedural_language;
  const rawPublicationLanguage = candidate.sourceSnapshot?.publication_language;
  const languageValues = [
    rawProceduralLanguage,
    candidate.proceduralLanguage,
    rawPublicationLanguage,
    candidate.publicationLanguage,
  ]
    .filter((value): value is string => typeof value === "string" && Boolean(value.trim()));

  for (const language of languageValues) {
    const normalized = language.trim().toLowerCase().replace("_", "-");
    const option = sourceLanguageOptions.find((item) =>
      item.value.toLowerCase() === normalized
      || item.label.toLowerCase() === normalized
      || item.value.toLowerCase().split("-")[0] === normalized
    );
    if (option) return option.value;
  }

  return undefined;
}

function StepContent(props: {
  step: number;
  sourceMode: WizardSourceMode;
  referenceNo: string;
  patentQuery: string;
  autoStartPatentSearch: boolean;
  selectedPatent?: WizardPatentCandidate;
  uploadedFiles: File[];
  uploadedFileSnapshots: WizardUploadedFile[];
  uploadReference?: WizardPatentCandidate;
  config: WizardConfig;
  dictionaries: WizardDictionaries;
  configFieldErrors: WizardConfigFieldErrors;
  payload: WizardPayload;
  quotePreview: ErpQuotePreview | null;
  quoteCurrency: ErpQuoteCurrencyCode;
  analysisStatus: WizardPatentAnalysisStatus;
  analysisResult?: WizardPayload["analysis"];
  analysisError?: string;
  onAnalysisRetry: () => void;
  quoteAction?: ReactNode;
  isPending: boolean;
  setSourceMode: (value: WizardSourceMode) => void;
  setReferenceNo: (value: string) => void;
  setPatentQuery: (value: string) => void;
  setPatentSearchResult: (value: WizardPatentCandidate) => void;
  startPatentSearch: () => void;
  failPatentSearch: () => void;
  setPatentSearchLoadingMessage: (message: string | null) => void;
  clearSourceState: () => void;
  setUploadedFiles: (value: File[]) => void;
  removeUploadedFile: (index: number) => void;
  setTifgFiles: (value: File[]) => void;
  removeTifg: () => void;
  setConfig: (value: WizardConfig) => void;
  onQuoteCurrencyChange: (value: ErpQuoteCurrencyCode) => void;
}) {
  if (props.step === 0) {
    return (
      <SourceStep
        sourceMode={props.sourceMode}
        channelCode={props.config.channelCode}
        patentQuery={props.patentQuery}
        autoStartPatentSearch={props.autoStartPatentSearch}
        uploadedFiles={props.uploadedFiles}
        uploadedFileSnapshots={props.uploadedFileSnapshots}
        uploadReference={props.uploadReference}
        isPending={props.isPending}
        onChannelChange={(value) => {
          if (props.sourceMode !== "patent_search" || props.config.channelCode !== value) {
            props.clearSourceState();
          }
          props.setConfig(updateWizardChannel(props.config, value));
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
        onPatentSearchStart={props.startPatentSearch}
        onPatentSearchFailure={props.failPatentSearch}
        onPatentSearchLoadingChange={props.setPatentSearchLoadingMessage}
        onFilesChange={props.setUploadedFiles}
        onRemoveFile={props.removeUploadedFile}
      />
    );
  }
  if (props.step === 1) {
    return (
      <ConfigStep
        referenceNo={props.referenceNo}
        config={props.config}
        configFieldErrors={props.configFieldErrors}
        sourceMode={props.sourceMode}
        patent={
          props.sourceMode === "patent_search"
            ? props.selectedPatent
            : undefined
        }
        analysis={props.analysisResult}
        tifgFiles={props.uploadedFiles}
        tifgFileSnapshots={props.uploadedFileSnapshots}
        analysisStatus={props.analysisStatus}
        analysisError={props.analysisError}
        onTifgFilesChange={props.setTifgFiles}
        onRemoveTifg={props.removeTifg}
        onReferenceNoChange={props.setReferenceNo}
        onChange={props.setConfig}
        dictionaries={props.dictionaries}
      />
    );
  }
  return (
    <QuoteStepContent
      payload={props.payload}
      estimate={props.quotePreview}
      currency={props.quoteCurrency}
      onCurrencyChange={props.onQuoteCurrencyChange}
      action={props.quoteAction}
      analysisStatus={props.analysisStatus}
      analysisError={props.analysisError}
      onAnalysisRetry={props.onAnalysisRetry}
    />
  );
}

function WizardFooter(props: {
  step: number;
  minimumStep?: number;
  nextLabel?: string;
  nextDisabled?: boolean;
  isPending: boolean;
  pendingLabel?: string;
  submitDisabled?: boolean;
  onCancel: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center justify-between">
      <Button type="button" variant="outline" disabled={props.isPending} onClick={props.onCancel}>Cancel</Button>
      <div className="flex gap-2">
        {props.step > (props.minimumStep ?? 0) ? <Button type="button" variant="outline" disabled={props.isPending} onClick={props.onPrevious}>Previous</Button> : null}
        {props.step < wizardSteps.length - 1 ? (
          <Button type="button" disabled={props.isPending || props.nextDisabled} onClick={props.onNext}>{props.nextLabel ?? "Next"}</Button>
        ) : (
          <Button
            type="button"
            disabled={props.isPending || props.submitDisabled}
            onClick={props.onSubmit}
          >
            {props.isPending
              ? props.pendingLabel ?? "Submitting..."
              : "Submit Request"}
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
  isSavingDraft: boolean;
  onOpenChange: (open: boolean) => void;
  onDiscard: () => void;
  onSaveDraft: () => void;
}) {
  return (
    <AlertDialog open={props.open} onOpenChange={props.onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel this request?</AlertDialogTitle>
          <AlertDialogDescription>
            Save your current Step 1–3 progress as a draft, keep editing, or discard it.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep editing</AlertDialogCancel>
          <Button
            type="button"
            variant="outline"
            disabled={props.isPending}
            onClick={props.onSaveDraft}
          >
            {props.isSavingDraft ? "Saving..." : "Save Draft"}
          </Button>
          <AlertDialogAction onClick={props.onDiscard}>Discard</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
