import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RequesterHeader } from "@/features/requester/components/requester-header";
import { StatusBadge, formatCurrency, formatDate, titleCaseStatus } from "@/features/requester/format";
import { getRequesterRequest } from "@/features/requester/queries";

type RequestFile = {
  id: string;
  original_filename: string;
  status: string;
  file_role?: string | null;
  language?: string | null;
  source: string;
  file_parse_results?: ParseResult | ParseResult[] | null;
};

type ParseResult = {
  page_count: number;
  word_count: number;
  claim_count: number;
  technical_fields?: string[] | null;
};

type RequestEvent = {
  id: string;
  event_type: string;
  created_at: string;
  from_status?: string | null;
  to_status?: string | null;
};

export default function RequestDetailPage({
  params,
}: {
  params: Promise<{ requestId: string }>;
}) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading request...</p>}>
      <RequestContent params={params} />
    </Suspense>
  );
}

async function RequestContent({
  params,
}: {
  params: Promise<{ requestId: string }>;
}) {
  const { requestId } = await params;
  const request = await getRequesterRequest(requestId);

  if (!request) notFound();

  const latestQuote = [...(request.quotes ?? [])].sort((a, b) => b.version_no - a.version_no)[0];
  const order = Array.isArray(request.orders) ? request.orders[0] : request.orders;
  const files = (request.request_files ?? []) as RequestFile[];
  const events = (request.request_events ?? []) as RequestEvent[];

  return (
    <div className="space-y-8">
      <RequesterHeader title={request.title ?? request.request_no} description={`Request ${request.request_no}`} />
      <div className="grid gap-4 md:grid-cols-4">
        <InfoCard title="Status"><StatusBadge status={request.workflow_stage} /></InfoCard>
        <InfoCard title="Files">{request.request_files?.length ?? 0}</InfoCard>
        <InfoCard title="Latest quote">{latestQuote ? formatCurrency(latestQuote.total_amount, latestQuote.currency) : "-"}</InfoCard>
        <InfoCard title="Updated">{formatDate(request.updated_at)}</InfoCard>
      </div>
      <Section title="Files">
        {files.map((file) => (
          <div key={file.id} className="rounded-md border p-3 text-sm">
            <div className="flex justify-between gap-3">
              <strong>{file.original_filename}</strong>
              <StatusBadge status={file.status} />
            </div>
            <p className="mt-1 text-muted-foreground">{file.file_role ?? "Patent document"} · {file.language ?? "unknown"} · {file.source}</p>
          </div>
        ))}
      </Section>
      <Section title="Parse results">
        {files.map((file) => {
          const result = Array.isArray(file.file_parse_results) ? file.file_parse_results[0] : file.file_parse_results;
          return (
            <div key={file.id} className="rounded-md border p-3 text-sm">
              <strong>{file.original_filename}</strong>
              <p className="mt-1 text-muted-foreground">
                {result ? `${result.page_count} pages · ${result.word_count} words · ${result.claim_count} claims · ${result.technical_fields?.join(", ")}` : "Not parsed"}
              </p>
            </div>
          );
        })}
      </Section>
      <Section title="Quote and negotiation">
        {latestQuote ? (
          <div className="flex items-center justify-between rounded-md border p-3 text-sm">
            <span>{formatCurrency(latestQuote.total_amount, latestQuote.currency)} · {titleCaseStatus(latestQuote.status)}</span>
            <Button asChild size="sm"><Link href={`/requester/requests/${request.id}/quote`}>Open quote</Link></Button>
          </div>
        ) : <p className="text-sm text-muted-foreground">No quote yet.</p>}
      </Section>
      <Section title="Workflow timeline">
        {events.map((event) => (
          <div key={event.id} className="rounded-md border p-3 text-sm">
            <strong>{event.event_type}</strong>
            <p className="text-muted-foreground">{formatDate(event.created_at)} · {event.from_status ?? "-"} to {event.to_status ?? "-"}</p>
          </div>
        ))}
      </Section>
      {order ? <Button asChild><Link href={`/requester/orders/${order.id}`}>Open order</Link></Button> : null}
    </div>
  );
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card><CardHeader className="pb-2"><CardTitle className="text-sm">{title}</CardTitle></CardHeader><CardContent>{children}</CardContent></Card>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}
