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
