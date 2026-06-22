"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { searchPatentCandidates } from "@/features/requester/actions";
import type {
  WizardPatentCandidate,
  WizardPatentFile,
  WizardSourceMode,
  WizardUploadedFile,
} from "@/features/requester/wizard-types";
import { fileToUploadedFile, toggleId } from "./new-request-wizard-utils";
import { Field, FileList, Info, StepShell } from "./new-request-wizard-shared";

export function BasicsStep(props: {
  title: string;
  sourceMode: WizardSourceMode;
  onTitleChange: (value: string) => void;
  onSourceModeChange: (value: WizardSourceMode) => void;
}) {
  return (
    <StepShell
      title="Basics"
      description="Provide the minimum information needed to start the request."
    >
      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Request title">
          <Input
            value={props.title}
            onChange={(event) => props.onTitleChange(event.target.value)}
            placeholder="EP validation translation"
          />
        </Field>
        <Field label="File source">
          <Select
            value={props.sourceMode}
            onValueChange={(value) =>
              props.onSourceModeChange(value as WizardSourceMode)
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="patent_search">
                Patent number search
              </SelectItem>
              <SelectItem value="upload">Upload files</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
    </StepShell>
  );
}

export function SourceStep(props: {
  sourceMode: WizardSourceMode;
  patentQuery: string;
  candidates: WizardPatentCandidate[];
  uploadedFiles: File[];
  uploadedFileSnapshots: WizardUploadedFile[];
  isPending: boolean;
  onPatentQueryChange: (value: string) => void;
  onPatentSearch: (candidates: WizardPatentCandidate[]) => void;
  onPatentSelect: (candidate: WizardPatentCandidate) => void;
  onFilesChange: (files: File[]) => void;
}) {
  if (props.sourceMode === "upload") {
    return (
      <StepShell
        title="Upload source files"
        description="Files are held locally until you save a draft or submit."
      >
        <Field label="Patent files">
          <Input
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.xml,.txt"
            onChange={(event) =>
              props.onFilesChange(Array.from(event.target.files ?? []))
            }
          />
        </Field>
        <FileList files={props.uploadedFiles.length ? props.uploadedFiles.map(fileToUploadedFile) : props.uploadedFileSnapshots} />
      </StepShell>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 space-y-5">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            Search patent records
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Search results are mock data until the patent API is connected.
          </p>
        </div>
        <form
          className="flex gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData();
            formData.set("patentQuery", props.patentQuery);
            searchPatentCandidates(formData).then((result) => {
              if (result.data?.candidates)
                props.onPatentSearch(result.data.candidates);
            });
          }}
        >
          <Input
            value={props.patentQuery}
            onChange={(event) => props.onPatentQueryChange(event.target.value)}
            placeholder="WO2026000001"
          />
          <Button type="submit" disabled={props.isPending}>
            Search
          </Button>
        </form>
      </div>
      <div className="mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="grid gap-5 md:grid-cols-3">
          {props.candidates.map((candidate) => (
            <PatentCard
              key={candidate.id}
              candidate={candidate}
              onSelect={() => props.onPatentSelect(candidate)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function PatentDetailStep(props: {
  sourceMode: WizardSourceMode;
  patent?: WizardPatentCandidate;
  uploadedFiles: File[];
  uploadedFileSnapshots: WizardUploadedFile[];
  selectedFileIds: string[];
  onSelectionChange: (ids: string[]) => void;
}) {
  const selectableFileIds =
    props.patent?.downloadableFiles.map((file) => file.id) ?? [];
  const allSelected =
    selectableFileIds.length > 0 &&
    selectableFileIds.every((id) => props.selectedFileIds.includes(id));

  if (props.sourceMode === "upload") {
    return (
      <StepShell
        title="Uploaded file details"
        description="These files will be uploaded when the request is saved."
      >
        <FileList files={props.uploadedFiles.length ? props.uploadedFiles.map(fileToUploadedFile) : props.uploadedFileSnapshots} />
      </StepShell>
    );
  }
  if (!props.patent) {
    return (
      <StepShell
        title="Patent detail"
        description="Select a patent from search results first."
      >
        <p className="text-sm text-muted-foreground">No patent selected yet.</p>
      </StepShell>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 space-y-5">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            {props.patent.title}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {props.patent.patentNumber} · {props.patent.legalStatus}
          </p>
        </div>
        <div className="grid gap-4 rounded-md border p-4 text-sm md:grid-cols-3">
          <Info label="Jurisdiction" value={props.patent.jurisdiction} />
          <Info label="Application no." value={props.patent.applicationNo} />
          <Info label="Publication no." value={props.patent.publicationNo} />
          <Info label="Applicants" value={props.patent.applicants.join(", ")} />
          <Info label="Filing date" value={props.patent.filingDate} />
          <Info label="Publication date" value={props.patent.publicationDate} />
        </div>
        <p className="text-sm text-muted-foreground">{props.patent.abstract}</p>
        <div className="flex items-center justify-between gap-4">
          <h3 className="font-medium">Downloadable files</h3>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Checkbox
              checked={allSelected}
              onCheckedChange={(checked) =>
                props.onSelectionChange(
                  checked === true ? selectableFileIds : [],
                )
              }
            />
            Select all
          </label>
        </div>
      </div>
      <div className="mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="space-y-2">
          {props.patent.downloadableFiles.map((file) => (
            <FileChoice
              key={file.id}
              file={file}
              checked={props.selectedFileIds.includes(file.id)}
              onCheckedChange={(checked) =>
                props.onSelectionChange(
                  toggleId(props.selectedFileIds, file.id, checked),
                )
              }
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function PatentCard({
  candidate,
  onSelect,
}: {
  candidate: WizardPatentCandidate;
  onSelect: () => void;
}) {
  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <CardTitle className="text-base">{candidate.patentNumber}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col space-y-4 text-sm">
        <p className="font-medium">{candidate.title}</p>
        <div className="space-y-1 text-muted-foreground">
          <p>
            {candidate.jurisdiction} · {candidate.legalStatus}
          </p>
          <p>{candidate.applicants.join(", ")}</p>
          <p>{candidate.downloadableFiles.length} downloadable files</p>
        </div>
      </CardContent>
      <CardFooter>
        <Button type="button" className="w-full" onClick={onSelect}>
          Select patent
        </Button>
      </CardFooter>
    </Card>
  );
}

function FileChoice({
  file,
  checked,
  onCheckedChange,
}: {
  file: WizardPatentFile;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between rounded-md border p-3 text-sm">
      <span className="flex items-center gap-3">
        <Checkbox
          checked={checked}
          onCheckedChange={(value) => onCheckedChange(value === true)}
        />
        <span>
          <strong>{file.label}</strong>
          <span className="block text-muted-foreground">
            {file.fileType.toUpperCase()} · {file.language}
          </span>
        </span>
      </span>
      <span className="text-muted-foreground">
        {file.wordCount.toLocaleString()} words · {file.pageCount} pages
      </span>
    </label>
  );
}
