"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileSignature, Info, Send } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  cancelPmSignatureRequest,
  removePmSignatureFile,
  retryPmSignatureEmail,
  savePmSignatureDraft,
  sendPmSignatureRequest,
} from "@/features/filing-signatures/pm-actions";
import { appendPmSignatureFiles } from "@/features/filing-signatures/pm-append-actions";
import type {
  FilingSignatureRequest,
  SignatureCountry,
  SignatureUpload,
} from "@/features/filing-signatures/types";
import { appendSignatureUploads } from "@/features/filing-signatures/types";
import { signatureFilesByDirection } from "@/features/filing-signatures/types";
import { CountrySignatureFilePicker } from "./country-signature-file-picker";
import { CountrySignatureFileLinks } from "./signature-file-links";
import { SignatureHistory } from "./signature-history";
import { PmPendingSignaturePackage } from "./pm-pending-signature-package";

type PanelActionResult = {
  success: boolean;
  error?: string;
  data?: unknown;
};

export function PmSignaturePanel({
  canManage,
  countries = [],
  requestId,
  signatureRequests,
  showHeader = true,
}: {
  canManage: boolean;
  countries?: SignatureCountry[];
  requestId: string;
  signatureRequests: FilingSignatureRequest[];
  showHeader?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [uploads, setUploads] = useState<SignatureUpload[]>([]);
  const [inputKey, setInputKey] = useState(0);
  const [isAppendOpen, setIsAppendOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [currentSignatureRequests, setCurrentSignatureRequests] = useState(signatureRequests);
  useEffect(() => {
    setCurrentSignatureRequests(signatureRequests);
  }, [signatureRequests]);
  const sorted = useMemo(
    () => [...currentSignatureRequests].sort(newestFirst),
    [currentSignatureRequests],
  );
  const active = sorted.find((request) => ["draft", "sent"].includes(request.status));
  const history = sorted.filter((request) => request.id !== active?.id);
  const [pmNote, setPmNote] = useState(active?.status === "draft" ? active.pm_note ?? "" : "");
  const [dueAt, setDueAt] = useState(active?.status === "draft" ? active.due_at ?? "" : "");
  const activeDraft = active?.status === "draft" ? active : null;
  const hasUnsavedDraftChanges = Boolean(
    uploads.length
      || (activeDraft && pmNote !== (activeDraft.pm_note ?? ""))
      || (activeDraft && dueAt !== (activeDraft.due_at ?? "")),
  );

  function run(
    action: () => Promise<PanelActionResult>,
    onSuccess?: (data?: unknown) => void,
    refresh = true,
  ) {
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      if (!result.success) {
        setMessage(result.error ?? "The signature request could not be updated.");
        return;
      }
      setMessage(actionWarning(result.data));
      setUploads([]);
      setInputKey((value) => value + 1);
      onSuccess?.(result.data);
      if (refresh) router.refresh();
    });
  }

  function saveDraft() {
    const formData = new FormData();
    formData.set("requestId", requestId);
    formData.set("pmNote", pmNote);
    formData.set("dueAt", dueAt);
    appendSignatureUploads(formData, uploads);
    run(() => savePmSignatureDraft(formData), (data) => {
      // The Action returns the authoritative draft so this panel need not refetch
      // the entire PM request detail graph after a successful save.
      const signatureRequest = (data as { signatureRequest?: FilingSignatureRequest } | undefined)
        ?.signatureRequest;
      if (!signatureRequest) return;
      setCurrentSignatureRequests((current) => [
        ...current.filter((item) => item.id !== signatureRequest.id),
        signatureRequest,
      ]);
    }, false);
  }

  function appendFiles(signatureRequestId: string) {
    const formData = new FormData();
    formData.set("signatureRequestId", signatureRequestId);
    appendSignatureUploads(formData, uploads);
    run(
      () => appendPmSignatureFiles(formData),
      () => setIsAppendOpen(false),
    );
  }

  function sendDraft(signatureRequestId: string) {
    const formData = new FormData();
    formData.set("signatureRequestId", signatureRequestId);
    formData.set("pmNote", pmNote);
    formData.set("dueAt", dueAt);
    run(() => sendPmSignatureRequest(formData));
  }

  function changeAppendOpen(open: boolean) {
    setIsAppendOpen(open);
    if (!open) {
      setUploads([]);
      setInputKey((value) => value + 1);
      setMessage(null);
    }
  }

  function runForRequest(
    action: (formData: FormData) => Promise<PanelActionResult>,
    signatureRequestId: string,
  ) {
    const formData = new FormData();
    formData.set("signatureRequestId", signatureRequestId);
    run(() => action(formData));
  }

  return (
    <Card id="signature-documents">
      {showHeader ? <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <FileSignature className="size-5" />
            Signature documents
            <TooltipProvider delayDuration={120}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label="Signature document workflow guidance"
                    className="rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Info className="size-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-64">
                  Always save the draft before sending it to the requester.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Send POA or filing forms to the requester and receive signed files.
          </p>
        </div>
        {active ? <Badge variant="outline">{statusLabel(active.status)}</Badge> : null}
      </CardHeader> : null}
      <CardContent className={`space-y-6 ${showHeader ? "" : "pt-6"}`}>
        <section
          aria-label="Current signature package"
          className="rounded-xl border bg-background p-5 shadow-sm"
        >
          <p className="mb-4 text-sm font-semibold">
            {active ? "Current package" : "New signature package"}
          </p>
          {active?.status === "sent" ? (
            <PmPendingSignaturePackage
              canAppend={canManage}
              disabled={isPending}
              countries={countries}
              uploads={uploads}
              inputKey={inputKey}
              message={message}
              open={isAppendOpen}
              request={active}
              onAppend={() => appendFiles(active.id)}
              onCancel={() => runForRequest(cancelPmSignatureRequest, active.id)}
              onUploadChange={setUploads}
              onOpenChange={changeAppendOpen}
              onRetry={() => runForRequest(retryPmSignatureEmail, active.id)}
            />
          ) : canManage ? (
            <DraftEditor
              active={activeDraft}
              countries={countries}
              disabled={isPending}
              dueAt={dueAt}
              uploads={uploads}
              hasUnsavedChanges={hasUnsavedDraftChanges}
              inputKey={inputKey}
              pmNote={pmNote}
              onCancel={active ? () => runForRequest(cancelPmSignatureRequest, active.id) : undefined}
              onDueAtChange={setDueAt}
              onUploadChange={setUploads}
              onNoteChange={setPmNote}
              onRemove={(fileId) => {
                const formData = new FormData();
                formData.set("fileId", fileId);
                run(() => removePmSignatureFile(formData));
              }}
              onSave={saveDraft}
              onSend={active ? () => sendDraft(active.id) : undefined}
            />
          ) : (
            <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              New signature packages can only be created while this request is In progress.
            </p>
          )}

          {message ? (
            <p className="mt-5 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              {message}
            </p>
          ) : null}
        </section>
        {history.length ? (
          <section
            aria-label="Signature package history"
            className="rounded-xl border bg-muted/20 p-5"
          >
            <SignatureHistory countries={countries} requests={history} viewer="pm" />
          </section>
        ) : null}
      </CardContent>
    </Card>
  );
}

function DraftEditor({
  active,
  countries,
  disabled,
  dueAt,
  uploads,
  hasUnsavedChanges,
  inputKey,
  pmNote,
  onCancel,
  onDueAtChange,
  onUploadChange,
  onNoteChange,
  onRemove,
  onSave,
  onSend,
}: {
  active: FilingSignatureRequest | null;
  countries: SignatureCountry[];
  disabled: boolean;
  dueAt: string;
  uploads: SignatureUpload[];
  hasUnsavedChanges: boolean;
  inputKey: number;
  pmNote: string;
  onCancel?: () => void;
  onDueAtChange: (value: string) => void;
  onUploadChange: (uploads: SignatureUpload[]) => void;
  onNoteChange: (value: string) => void;
  onRemove: (fileId: string) => void;
  onSave: () => void;
  onSend?: () => void;
}) {
  const sourceFiles = active ? signatureFilesByDirection(active, "pm_to_requester") : [];
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="text-sm font-medium">
          <span className="text-destructive" aria-hidden="true">*</span>{" "}
          Signature documents
        </p>
        <CountrySignatureFilePicker
          countries={countries}
          disabled={disabled}
          inputKey={inputKey}
          label="Upload signature documents"
          onChange={onUploadChange}
          uploads={uploads}
        />
        <p className="text-xs text-muted-foreground">
          PDF, DOC, DOCX, JPG, PNG, or ZIP · up to 10 files · 100 MB total
        </p>
      </div>
      <label className="space-y-2 text-sm">
        <span className="font-medium">Message to requester (optional)</span>
        <textarea
          className="min-h-24 w-full rounded-md border bg-background px-3 py-2"
          disabled={disabled}
          maxLength={2000}
          value={pmNote}
          onChange={(event) => onNoteChange(event.target.value)}
        />
      </label>
      <label className="block max-w-sm space-y-2 text-sm">
        <span className="font-medium">Signature due date (optional)</span>
        <input
          className="h-10 w-full rounded-md border bg-background px-3"
          disabled={disabled}
          type="date"
          value={dueAt}
          onChange={(event) => onDueAtChange(event.target.value)}
        />
      </label>
      {sourceFiles.length ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">Files in draft</p>
          <CountrySignatureFileLinks
            countries={countries}
            files={sourceFiles}
            onRemove={onRemove}
            removeDisabled={disabled}
          />
        </div>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        {onCancel ? <Button type="button" variant="ghost" disabled={disabled} onClick={onCancel}>Cancel package</Button> : null}
        <Button
          type="button"
          variant="outline"
          disabled={disabled || (!sourceFiles.length && !uploads.length)}
          onClick={onSave}
        >
          {disabled ? "Saving..." : active ? "Save draft" : "Create draft"}
        </Button>
        {onSend ? (
          <Button
            type="button"
            disabled={disabled || !sourceFiles.length || hasUnsavedChanges}
            onClick={onSend}
          >
            <Send /> Send to requester
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function newestFirst(left: FilingSignatureRequest, right: FilingSignatureRequest) {
  return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
}

function statusLabel(value: string) {
  return value.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function actionWarning(data: unknown) {
  if (!data || typeof data !== "object" || !("warning" in data)) {
    return null;
  }
  return typeof data.warning === "string" ? data.warning : null;
}
