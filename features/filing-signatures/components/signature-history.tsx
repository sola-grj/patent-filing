import { Badge } from "@/components/ui/badge";

import type { FilingSignatureRequest } from "../types";
import { signatureFilesByDirection } from "../types";
import { SignatureFileLinks, SignatureZipLink } from "./signature-file-links";

export function SignatureHistory({
  requests,
  viewer,
}: {
  requests: FilingSignatureRequest[];
  viewer: "pm" | "requester";
}) {
  if (!requests.length) {
    return null;
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">History</p>
      {requests.map((request) => {
        const sourceFiles = signatureFilesByDirection(request, "pm_to_requester");
        const returnedFiles = signatureFilesByDirection(request, "requester_to_pm");
        return (
          <details key={request.id} className="rounded-lg border p-4">
            <summary className="cursor-pointer list-none text-sm font-medium">
              <span className="flex flex-wrap items-center justify-between gap-3">
                <span>{historyTitle(request)}</span>
                <Badge variant="outline">{titleCase(request.status)}</Badge>
              </span>
            </summary>
            <div className="mt-4 space-y-4">
              <FileGroup
                title="Documents sent for signature"
                files={sourceFiles}
                signatureRequestId={request.id}
                direction="pm_to_requester"
              />
              {returnedFiles.length ? (
                <FileGroup
                  title={viewer === "pm" ? "Signed files returned" : "Signed files submitted"}
                  files={returnedFiles}
                  signatureRequestId={request.id}
                  direction="requester_to_pm"
                />
              ) : null}
            </div>
          </details>
        );
      })}
    </div>
  );
}

function FileGroup({
  direction,
  files,
  signatureRequestId,
  title,
}: {
  direction: "pm_to_requester" | "requester_to_pm";
  files: ReturnType<typeof signatureFilesByDirection>;
  signatureRequestId: string;
  title: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
          {title}
        </p>
        {files.length > 1 ? (
          <SignatureZipLink direction={direction} signatureRequestId={signatureRequestId} />
        ) : null}
      </div>
      <SignatureFileLinks files={files} />
    </div>
  );
}

function historyTitle(request: FilingSignatureRequest) {
  const date = request.completed_at ?? request.cancelled_at ?? request.sent_at ?? request.created_at;
  return `Signature package · ${formatDate(date)}`;
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
