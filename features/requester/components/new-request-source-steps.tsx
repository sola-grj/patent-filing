"use client";

import { Upload } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { lookupPatentForWizard } from "@/features/requester/actions";
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
    title: "EP",
    className: "bg-[linear-gradient(135deg,#d946ef,#ec4899)] text-white",
  },
  {
    id: "pct",
    title: "PCT",
    className: "bg-[linear-gradient(135deg,#1d4ed8,#1e3a8a)] text-white",
  },
  {
    id: "paris_convention",
    title: "Paris Convention",
    className: "bg-[linear-gradient(135deg,#0f766e,#14b8a6)] text-white",
  },
  {
    id: "upload_files",
    title: "Upload Files",
    className: "bg-[linear-gradient(135deg,#3f3f46,#52525b)] text-white",
  },
] as const;

type SearchEntryCard = typeof searchEntryCards[number];

export function SourceStep(props: {
  sourceMode: WizardSourceMode;
  channelCode: string;
  patentQuery: string;
  uploadedFiles: File[];
  uploadedFileSnapshots: WizardUploadedFile[];
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
  const activeCardId = props.sourceMode === "upload"
    ? "upload_files"
    : props.channelCode;
  const activeCard = searchEntryCards.find((card) => card.id === activeCardId) ?? searchEntryCards[0];
  const patentSearchMode = props.sourceMode === "patent_search";

  return (
    <StepShell
      title="Create a request"
      description="Choose the intake route first. Paris Convention, PCT, and EP all use patent number search. Upload switches the intake area to file staging."
    >
      <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-6 overflow-hidden">
        <div className="grid shrink-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {searchEntryCards.map((card) => (
            <EntryModeCard
              key={card.id}
              card={card}
              active={activeCardId === card.id}
              onClick={() => {
                setSearchError(null);
                if (card.id === "upload_files") {
                  props.onSourceModeChange("upload");
                  return;
                }

                props.onSourceModeChange("patent_search");
                props.onChannelChange(card.id);
              }}
            />
          ))}
        </div>

        {patentSearchMode ? (
          <div className="space-y-2">
            <form
              className="flex flex-col gap-3 md:flex-row"
              onSubmit={(event) => {
                event.preventDefault();
                setSearchError(null);
                if (!props.patentQuery.trim()) {
                  setSearchError("Enter a patent number to search.");
                  return;
                }
                props.onPatentSearchLoadingChange("Parsing patent details");
                props.onPatentSearchStart();
                startSearchTransition(async () => {
                  try {
                    const formData = new FormData();
                    formData.set("patentQuery", props.patentQuery);
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
            <UploadSourceField onFilesChange={props.onFilesChange} />
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

function UploadSourceField({
  onFilesChange,
}: {
  onFilesChange: (files: File[]) => void;
}) {
  const inputId = "request-source-upload";

  return (
    <div className="space-y-3">
      <input
        id={inputId}
        type="file"
        multiple
        accept=".pdf,.doc,.docx,.xml,.txt"
        className="sr-only"
        onChange={(event) =>
          onFilesChange(Array.from(event.target.files ?? []))
        }
      />
      <label
        htmlFor={inputId}
        className="flex min-h-20 cursor-pointer items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-fuchsia-400 bg-white px-6 py-5 text-center text-fuchsia-600 transition-colors hover:border-fuchsia-500 hover:bg-fuchsia-50/40"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-fuchsia-300 bg-fuchsia-50">
          <Upload className="h-5 w-5" />
        </span>
        <span className="text-[1.125rem] font-semibold tracking-[-0.02em]">
          Upload Source Document
        </span>
      </label>
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
      className={`rounded-[22px] border p-[4px] text-left transition-all duration-200 ${
        active
          ? "border-[#64748b] bg-[#64748b] shadow-[0_18px_44px_rgba(15,23,42,0.16)]"
          : "border-border hover:border-foreground/15 hover:shadow-[0_10px_24px_rgba(15,23,42,0.08)]"
      }`}
    >
      <div
        className={`flex min-h-[144px] items-center justify-center rounded-[18px] px-6 py-8 text-center transition-all duration-200 ${
          active ? "shadow-[inset_0_0_0_1px_rgba(255,255,255,0.92)]" : ""
        } ${card.className}`}
      >
        <p className="max-w-[11ch] text-[1.5rem] font-semibold leading-[1.15] tracking-[-0.03em]">
          {card.title}
        </p>
      </div>
    </button>
  );
}

function resolvePatentPlaceholder(card: SearchEntryCard) {
  if (card.id === "paris_convention") {
    return "EP1234567";
  }
  if (card.id === "ep") {
    return "EP3987654";
  }
  return "PCT/EP2021/022481";
}
