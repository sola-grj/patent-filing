"use client";

import { LockKeyhole } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { FileUploadDropzone } from "@/components/ui/file-upload-dropzone";
import { Input } from "@/components/ui/input";
import { lookupPatentForWizard } from "@/features/requester/actions";
import { patentNumberErrorForPath } from "@/features/requester/patent-number-validation";
import { requestPathLabels } from "@/features/requester/request-paths";
import type {
  WizardPatentCandidate,
  WizardSourceMode,
  WizardUploadedFile,
} from "@/features/requester/wizard-types";
import { fileToUploadedFile } from "./new-request-wizard-utils";
import { FileList, StepShell } from "./new-request-wizard-shared";

const searchEntryCards = [
  {
    id: "ep",
    title: "EPV",
    className: "bg-[linear-gradient(135deg,#d946ef,#ec4899)] text-white",
    available: true,
  },
  {
    id: "pct",
    title: requestPathLabels.pct,
    className: "bg-[linear-gradient(135deg,#1d4ed8,#1e3a8a)] text-white",
    available: false,
  },
  {
    id: "paris_convention",
    title: requestPathLabels.paris_convention,
    className: "bg-[linear-gradient(135deg,#0f766e,#14b8a6)] text-white",
    available: false,
  },
  {
    id: "upload_files",
    title: "Upload Files",
    className: "bg-[linear-gradient(135deg,#3f3f46,#52525b)] text-white",
    available: false,
  },
] as const;

type SearchEntryCard = typeof searchEntryCards[number];

export function SourceStep(props: {
  sourceMode: WizardSourceMode;
  channelCode: string;
  patentQuery: string;
  autoStartPatentSearch?: boolean;
  uploadedFiles: File[];
  uploadedFileSnapshots: WizardUploadedFile[];
  uploadReference?: WizardPatentCandidate;
  isPending: boolean;
  onChannelChange: (value: string) => void;
  onSourceModeChange: (value: WizardSourceMode) => void;
  onPatentQueryChange: (value: string) => void;
  onPatentSearch: (patent: WizardPatentCandidate) => Promise<void> | void;
  onPatentSearchStart: () => void;
  onPatentSearchFailure: () => void;
  onPatentSearchLoadingChange: (message: string | null) => void;
  onFilesChange: (files: File[]) => void;
  onRemoveFile: (index: number) => void;
}) {
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isSearching, startSearchTransition] = useTransition();
  const autoSearchStarted = useRef(false);
  const activeCardId = props.sourceMode === "upload"
    ? "upload_files"
    : props.channelCode;
  const activeCard = searchEntryCards.find((card) => card.id === activeCardId) ?? searchEntryCards[0];
  const patentSearchMode = props.sourceMode === "patent_search";

  const searchPatent = useCallback(async () => {
    props.onPatentSearchLoadingChange("Parsing patent details");
    props.onPatentSearchStart();
    try {
      const formData = new FormData();
      formData.set("patentQuery", props.patentQuery);
      formData.set("channelCode", props.channelCode);
      const result = await lookupPatentForWizard(formData);

      if (result.data?.patent) {
        await props.onPatentSearch(result.data.patent);
        return;
      }

      props.onPatentSearchFailure();
      setSearchError(
        result.error || "No patent data was found. Check the patent number and try again.",
      );
    } catch {
      props.onPatentSearchFailure();
      setSearchError("Patent search failed. Please try again later.");
    } finally {
      props.onPatentSearchLoadingChange(null);
    }
  }, [props]);

  useEffect(() => {
    if (
      !props.autoStartPatentSearch
      || autoSearchStarted.current
      || !patentSearchMode
      || !props.patentQuery.trim()
    ) {
      return;
    }

    autoSearchStarted.current = true;
    startSearchTransition(async () => {
      await searchPatent();
    });
  }, [patentSearchMode, props.autoStartPatentSearch, props.patentQuery, searchPatent]);

  return (
    <StepShell
      title="Create a request"
      description="Choose the intake path first. EPV uses patent number search."
    >
      <div className="grid h-full min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] gap-6 overflow-hidden">
        <div className="rounded-lg border border-emerald-100 bg-emerald-50/70 px-3 py-2 text-sm text-emerald-700">
          EPV is available now. Additional filing routes are coming soon.
        </div>
        <div className="grid shrink-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {searchEntryCards.map((card) => (
            <EntryModeCard
              key={card.id}
              card={card}
              active={activeCardId === card.id}
              onClick={() => {
                if (!card.available) return;
                setSearchError(null);
                props.onSourceModeChange("patent_search");
                props.onChannelChange(card.id);
              }}
            />
          ))}
        </div>

        {patentSearchMode ? (
          <div className="space-y-3">
            <form
              className="flex flex-col gap-3 md:flex-row"
              onSubmit={(event) => {
                event.preventDefault();
                setSearchError(null);
                if (!props.patentQuery.trim()) {
                  setSearchError("Enter a patent number to search.");
                  return;
                }
                const validationError = patentNumberErrorForPath(
                  props.channelCode,
                  props.patentQuery,
                );
                if (validationError) {
                  setSearchError(validationError);
                  return;
                }
                startSearchTransition(async () => {
                  await searchPatent();
                });
              }}
            >
              <Input
                value={props.patentQuery}
                disabled={props.isPending || isSearching}
                onChange={(event) => {
                  setSearchError(null);
                  props.onPatentQueryChange(event.target.value);
                }}
                placeholder={resolvePatentPlaceholder(activeCard)}
                className="focus-visible:ring-0"
              />
              <Button
                type="submit"
                disabled={props.isPending || isSearching}
                className="md:min-w-32"
              >
                {isSearching ? "Searching..." : "Search patent"}
              </Button>
            </form>
            {searchError ? (
              <p role="alert" className="text-sm text-destructive">
                {searchError}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-5 overflow-hidden rounded-2xl border bg-muted/20 p-5">
            <div className="space-y-4">
              {props.uploadReference ? (
                <UploadReferenceCard patent={props.uploadReference} />
              ) : null}
              <FileUploadDropzone
                accept=".pdf,.doc,.docx,.xml,.txt"
                inputId="request-source-upload"
                label="Upload Source Document"
                onFilesChange={props.onFilesChange}
              />
            </div>
            <div className="min-h-0 overflow-hidden">
              <div className="h-full min-h-0 overflow-y-auto overscroll-contain pr-1">
                <FileList
                  files={
                    props.uploadedFiles.length
                      ? props.uploadedFiles.map(fileToUploadedFile)
                      : props.uploadedFileSnapshots
                  }
                  onRemove={props.onRemoveFile}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </StepShell>
  );
}

function UploadReferenceCard({ patent }: { patent: WizardPatentCandidate }) {
  return (
    <div className="rounded-xl border bg-background px-4 py-3 text-sm">
      <p className="font-medium">Patent reference (not saved)</p>
      <p className="mt-1 text-muted-foreground">
        {patent.publicationNo || patent.patentNumber}
        {patent.title ? ` · ${patent.title}` : ""}
      </p>
    </div>
  );
}

function EntryModeCard({
  card,
  active,
  onClick,
}: {
  card: SearchEntryCard;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!card.available}
      aria-label={card.available ? card.title : `${card.title} coming soon`}
      className={`relative rounded-[22px] border p-[4px] text-left transition-all duration-200 ${
        active && card.available
          ? "border-[#64748b] bg-[#64748b] shadow-[0_18px_44px_rgba(15,23,42,0.16)]"
          : "border-border"
      } ${
        card.available
          ? "hover:border-foreground/15 hover:shadow-[0_10px_24px_rgba(15,23,42,0.08)]"
          : "cursor-not-allowed opacity-45"
      }`}
    >
      {!card.available ? (
        <>
          <LockKeyhole className="absolute left-4 top-4 z-10 h-4 w-4 text-white" aria-hidden="true" />
          <span className="absolute right-4 top-3 z-10 rounded-md bg-white px-3 py-1 text-xs font-medium text-slate-600">
            Coming soon
          </span>
        </>
      ) : null}
      <div
        className={`flex min-h-[144px] items-center justify-center rounded-[18px] px-6 py-8 text-center transition-all duration-200 ${
          active && card.available ? "shadow-[inset_0_0_0_1px_rgba(255,255,255,0.92)]" : ""
        } ${card.className}`}
      >
        <p className="whitespace-nowrap text-[clamp(1.125rem,1.35vw,1.5rem)] font-semibold leading-[1.15] tracking-[-0.03em] max-[360px]:whitespace-normal">
          {card.title}
        </p>
      </div>
    </button>
  );
}

function resolvePatentPlaceholder(card: SearchEntryCard) {
  if (card.id === "paris_convention") {
    return "US20210184727A1";
  }
  if (card.id === "ep") {
    return "EP3987654";
  }
  return "PCT/EP2021/022481";
}
