"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileSignature } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { submitRequesterSignatureFiles } from "@/features/filing-signatures/requester-actions";
import type {
  FilingSignatureRequest,
  SignatureCountry,
  SignatureUpload,
} from "@/features/filing-signatures/types";
import { appendSignatureUploads } from "@/features/filing-signatures/types";
import { signatureFilesByDirection } from "@/features/filing-signatures/types";
import { CountrySignatureFilePicker } from "./country-signature-file-picker";
import { CountrySignatureFileLinks, SignatureZipLink } from "./signature-file-links";
import { SignatureHistory } from "./signature-history";

export function RequesterSignaturePanel({
  countries = [],
  signatureRequests,
  canSubmit = true,
  showHeader = true,
}: {
  countries?: SignatureCountry[];
  signatureRequests: FilingSignatureRequest[];
  canSubmit?: boolean;
  showHeader?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [uploads, setUploads] = useState<SignatureUpload[]>([]);
  const [inputKey, setInputKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const sorted = useMemo(
    () => signatureRequests
      .filter((request) => request.status !== "draft")
      .sort(newestFirst),
    [signatureRequests],
  );
  const active = sorted.find((request) => request.status === "sent");
  const history = sorted.filter((request) => request.id !== active?.id);

  if (!active && !history.length) {
    return null;
  }

  function submit() {
    if (!active) return;
    const formData = new FormData();
    formData.set("signatureRequestId", active.id);
    appendSignatureUploads(formData, uploads);
    setError(null);
    startTransition(async () => {
      const result = await submitRequesterSignatureFiles(formData);
      if (!result.success) {
        setError(result.error ?? "Signed files could not be submitted.");
        return;
      }
      setUploads([]);
      setInputKey((value) => value + 1);
      router.refresh();
    });
  }

  const sourceFiles = active
    ? signatureFilesByDirection(active, "pm_to_requester")
    : [];
  const requiredCountryIds = [...new Set(
    sourceFiles
      .map((file) => file.ep_country_id)
      .filter((countryId): countryId is number => Number.isInteger(countryId)),
  )];
  const uploadCountries = requiredCountryIds.map((countryId) =>
    countries.find((country) => country.id === countryId)
      ?? { id: countryId, name: `EP country ${countryId}` },
  );
  const hasCountryCoverage = requiredCountryIds.every((countryId) =>
    uploads.some((upload) => upload.epCountryId === countryId),
  );

  return (
    <Card id="signature-documents" className={active ? "border-amber-300 dark:border-amber-900" : undefined}>
      {showHeader ? <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <FileSignature className="size-5" />
            Signature documents
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Download, sign, and return filing documents securely through Pat.
          </p>
        </div>
        {active ? <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-200">Action required</Badge> : null}
      </CardHeader> : null}
      <CardContent className={`space-y-6 ${showHeader ? "" : "pt-6"}`}>
        {active ? (
          <div className="space-y-5">
            <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-4 text-sm dark:border-amber-900 dark:bg-amber-950/30">
              <p className="font-medium">These documents require your signature.</p>
              <p className="mt-1 text-muted-foreground">Sent {formatDate(active.sent_at)}</p>
              {active.due_at || active.pm_note?.trim() ? (
                <div
                  className={`mt-4 grid gap-3 ${
                    active.due_at && active.pm_note?.trim()
                      ? "sm:grid-cols-[minmax(0,0.35fr)_minmax(0,1fr)]"
                      : ""
                  }`}
                >
                  {active.due_at ? (
                    <div className="rounded-md border border-amber-200/80 bg-background/70 p-3 dark:border-amber-900">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Due date
                      </p>
                      <p className="mt-1 font-medium">{formatDueDate(active.due_at)}</p>
                    </div>
                  ) : null}
                  {active.pm_note?.trim() ? (
                    <div className="rounded-md border border-amber-200/80 bg-background/70 p-3 dark:border-amber-900">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        PM note
                      </p>
                      <p className="mt-1 whitespace-pre-wrap">{active.pm_note}</p>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">Documents to sign</p>
                {sourceFiles.length > 1 ? <SignatureZipLink direction="pm_to_requester" signatureRequestId={active.id} /> : null}
              </div>
              <CountrySignatureFileLinks countries={countries} files={sourceFiles} />
            </div>
            {canSubmit ? <div className="space-y-2">
              <CountrySignatureFilePicker
                countries={uploadCountries}
                disabled={isPending}
                inputKey={inputKey}
                label="Upload signed files"
                onChange={setUploads}
                uploads={uploads}
              />
              <p className="text-xs text-muted-foreground">
                PDF, DOC, DOCX, JPG, PNG, or ZIP · up to 10 files · 100 MB total
              </p>
            </div> : <p className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">Only the designated signature recipient can upload signed files.</p>}
            {canSubmit && error ? <p className="text-sm text-destructive">{error}</p> : null}
            {canSubmit ? <div className="flex justify-end">
              <Button
                type="button"
                disabled={isPending || !uploads.length || !hasCountryCoverage}
                onClick={submit}
              >
                {isPending ? "Submitting..." : "Submit signed files"}
              </Button>
            </div> : null}
          </div>
        ) : null}
        <SignatureHistory countries={countries} requests={history} viewer="requester" />
      </CardContent>
    </Card>
  );
}

function newestFirst(left: FilingSignatureRequest, right: FilingSignatureRequest) {
  return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function formatDueDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}
