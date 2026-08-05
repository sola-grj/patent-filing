"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileSignature, Upload } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { submitRequesterSignatureFiles } from "@/features/filing-signatures/requester-actions";
import type { FilingSignatureRequest } from "@/features/filing-signatures/types";
import { signatureFilesByDirection } from "@/features/filing-signatures/types";

import { SignatureFileLinks, SignatureZipLink } from "./signature-file-links";
import { SignatureHistory } from "./signature-history";

export function RequesterSignaturePanel({
  signatureRequests,
}: {
  signatureRequests: FilingSignatureRequest[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [files, setFiles] = useState<File[]>([]);
  const [inputKey, setInputKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const sorted = useMemo(
    () => [...signatureRequests].sort(newestFirst),
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
    files.forEach((file) => formData.append("files", file));
    setError(null);
    startTransition(async () => {
      const result = await submitRequesterSignatureFiles(formData);
      if (!result.success) {
        setError(result.error ?? "Signed files could not be submitted.");
        return;
      }
      setFiles([]);
      setInputKey((value) => value + 1);
      router.refresh();
    });
  }

  const sourceFiles = active
    ? signatureFilesByDirection(active, "pm_to_requester")
    : [];

  return (
    <Card id="signature-documents" className={active ? "border-amber-300 dark:border-amber-900" : undefined}>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
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
      </CardHeader>
      <CardContent className="space-y-6">
        {active ? (
          <div className="space-y-5">
            <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-4 text-sm dark:border-amber-900 dark:bg-amber-950/30">
              <p className="font-medium">These documents require your signature.</p>
              <p className="mt-1 text-muted-foreground">
                Sent {formatDate(active.sent_at)}
                {active.due_at ? ` · Please return by ${formatDate(active.due_at)}` : ""}
              </p>
              {active.pm_note ? <p className="mt-3 whitespace-pre-wrap">{active.pm_note}</p> : null}
            </div>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">Documents to sign</p>
                {sourceFiles.length > 1 ? <SignatureZipLink direction="pm_to_requester" signatureRequestId={active.id} /> : null}
              </div>
              <SignatureFileLinks files={sourceFiles} />
            </div>
            <label className="block rounded-xl border border-dashed bg-muted/20 p-4 text-sm">
              <span className="flex items-center gap-2 font-medium"><Upload /> Upload signed files</span>
              <span className="mt-1 block text-xs text-muted-foreground">
                PDF, DOC, DOCX, JPG, PNG, or ZIP · up to 10 files · 100 MB total
              </span>
              <input
                key={inputKey}
                className="mt-3 block w-full text-sm"
                disabled={isPending}
                multiple
                type="file"
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.zip"
                onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
              />
              {files.length ? <span className="mt-2 block text-xs">{files.length} signed file(s) selected</span> : null}
            </label>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <div className="flex justify-end">
              <Button type="button" disabled={isPending || !files.length} onClick={submit}>
                {isPending ? "Submitting..." : "Submit signed files"}
              </Button>
            </div>
          </div>
        ) : null}
        <SignatureHistory requests={history} viewer="requester" />
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
