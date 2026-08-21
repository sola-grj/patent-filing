import { Files, FileText } from "lucide-react";
import type { ReactNode } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type RequestInformationFile = {
  id: string;
  source?: string | null;
  status?: string | null;
  updated_at?: string | null;
  original_filename: string;
  mime_type?: string | null;
  language?: string | null;
  metadata?: { size?: number | null } | null;
  file_parse_results?: FileParseResult | FileParseResult[] | null;
};

type FileParseResult = {
  word_count?: number | null;
  page_count?: number | null;
  claim_count?: number | null;
  document_kind?: string | null;
  source_url?: string | null;
  retrieval_mode?: string | null;
  document_language?: string | null;
  publication_date?: string | null;
  document_date?: string | null;
  document_sha256?: string | null;
  epo_document_id?: string | null;
  is_pre_grant?: boolean | null;
  is_legacy_pre_grant?: boolean | null;
  structure_json?: {
    parts?: Record<string, {
      word_count?: number;
      status?: "parsed" | "not_present" | "parse_failed";
      method?: string;
    }>;
    aggregate?: { claims_words?: number };
    warnings?: string[];
  } | null;
};

export function RequestFileInformation({
  action,
  cardClassName,
  contentClassName,
  files,
}: {
  action?: ReactNode;
  cardClassName?: string;
  contentClassName?: string;
  files: RequestInformationFile[];
}) {
  return (
    <Card className={cardClassName}>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="flex items-center gap-2">
          <Files className="size-5" />
          File Information
        </CardTitle>
        {action}
      </CardHeader>
      <CardContent className={contentClassName}>
        {files.length ? (
          <div className="divide-y rounded-lg border">
            {files.map((file) => {
              const parseResult = firstRelation(file.file_parse_results);

              return (
                <div
                  key={file.id}
                  className="space-y-4 p-4"
                >
                  <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="rounded-lg border bg-muted/20 p-2 text-muted-foreground">
                        <FileText className="size-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {file.original_filename}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {file.mime_type || "File"}
                          {file.language ? ` · ${file.language.toUpperCase()}` : ""}
                        </p>
                      </div>
                    </div>
                    <dl className="grid grid-cols-4 gap-5 text-right">
                      <FileMetric label="Size" value={formatFileSize(file.metadata?.size)} />
                      <FileMetric label="Words" value={formatCount(parseResult?.word_count)} />
                      <FileMetric label="Claims words" value={formatCount(parseResult?.structure_json?.aggregate?.claims_words)} />
                      <FileMetric label="Claims" value={formatCount(parseResult?.claim_count)} />
                    </dl>
                  </div>
                  {parseResult ? <EpoParseAudit result={parseResult} /> : null}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
            No uploaded files are associated with this request.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function EpoParseAudit({ result }: { result: FileParseResult }) {
  const parts = result.structure_json?.parts ?? {};
  const partLabels: Record<string, string> = {
    abstract: "Abstract",
    abstract_drawing: "Abstract drawing",
    description: "Description",
    description_drawings: "Description drawings",
    claims: "Claims",
  };
  return (
    <div className="space-y-3 rounded-lg bg-muted/20 p-3">
      <dl className="grid gap-x-5 gap-y-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
        <AuditValue label="Document" value={result.document_kind} />
        <AuditValue label="EPO document ID" value={result.epo_document_id} />
        <AuditValue label="Retrieval" value={result.retrieval_mode} />
        <AuditValue label="Language" value={result.document_language?.toUpperCase()} />
        <AuditValue label="Publication date" value={result.publication_date} />
        <AuditValue label="Document date" value={result.document_date} />
        <AuditValue label="Pages" value={formatCount(result.page_count)} />
        <AuditValue
          label="Pre-grant"
          value={result.is_pre_grant
            ? result.is_legacy_pre_grant ? "Yes · legacy TIFG" : "Yes"
            : "No"}
        />
      </dl>
      {result.source_url ? (
        <p className="break-all text-xs">
          <span className="text-muted-foreground">Source URL: </span>
          {/^https?:\/\//.test(result.source_url) ? (
            <a className="underline underline-offset-2" href={result.source_url} target="_blank" rel="noreferrer">
              {result.source_url}
            </a>
          ) : result.source_url}
        </p>
      ) : null}
      {result.document_sha256 ? (
        <p className="break-all font-mono text-[11px]">
          <span className="font-sans text-muted-foreground">SHA-256: </span>
          {result.document_sha256}
        </p>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {Object.entries(partLabels).map(([key, label]) => {
          const part = parts[key];
          return (
            <div key={key} className="rounded-md border bg-background px-3 py-2 text-xs">
              <p className="font-medium">{label}</p>
              <p className="mt-1 text-muted-foreground">
                {part?.status ?? "parse_failed"} · {formatCount(part?.word_count)} words
              </p>
              {part?.method ? <p className="mt-0.5 truncate text-muted-foreground">{part.method}</p> : null}
            </div>
          );
        })}
      </div>
      {result.structure_json?.warnings?.length ? (
        <ul className="list-disc space-y-1 pl-5 text-xs text-amber-700">
          {result.structure_json.warnings.map((warning) => <li key={warning}>{warning}</li>)}
        </ul>
      ) : null}
    </div>
  );
}

function AuditValue({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium">{value || "-"}</dd>
    </div>
  );
}

function FileMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 whitespace-nowrap text-sm font-medium">{value}</dd>
    </div>
  );
}

function firstRelation<T>(value?: T | T[] | null) {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function formatFileSize(value?: number | null) {
  if (value == null || value < 0) return "-";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatCount(value?: number | null) {
  return value == null ? "-" : value.toLocaleString();
}
