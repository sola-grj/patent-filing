import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  RequesterStatusBadge,
  type RequesterLifecycleStatus,
  getRequesterStatusMeta,
} from "@/features/requester/requester-status";
import { RequesterCreateRequestButton } from "./requester-create-request-button";

export function HeroSection({
  organizationName,
}: {
  organizationName: string;
}) {
  return (
    <section className="relative overflow-hidden rounded-[32px] border border-emerald-900/10 bg-[linear-gradient(135deg,#163a39_0%,#0f5c50_55%,#11806a_100%)] px-8 py-9 text-white shadow-[0_24px_80px_rgba(10,42,37,0.18)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.12),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.08),transparent_26%)]" />
      <div className="absolute -left-20 top-10 h-56 w-56 rounded-full bg-white/5 blur-3xl" />
      <div className="absolute bottom-0 right-0 h-64 w-64 rounded-full bg-emerald-300/10 blur-3xl" />
      <div className="relative flex min-h-[320px] flex-col justify-between gap-10">
        <div className="max-w-4xl space-y-6">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.26em] text-emerald-100/85">
              Patentia Requester Workspace
            </p>
            <div className="space-y-2">
              <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white xl:text-[2.7rem]">
                Welcome back, {organizationName}.
              </h1>
              <p className="max-w-2xl text-sm leading-7 text-emerald-50/80 xl:text-base">
                Coordinate patent translation requests, monitor filing-stage
                priorities, and keep prosecution documents moving through quote,
                production, and delivery in one workspace.
              </p>
            </div>
          </div>
        </div>
        <div className="flex justify-end">
          <div className="flex flex-wrap gap-3">
            <RequesterCreateRequestButton
              size="lg"
              label="New Request"
              className="rounded-full bg-white px-6 text-slate-900 hover:bg-white/92"
            />
            <Button
              asChild
              variant="outline"
              className="rounded-full border-white/18 bg-white/10 px-6 text-white hover:bg-white/14 hover:text-white"
            >
              <Link href="/requester/requests">Open Requests</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

export function MetricCard({
  status,
  value,
  href,
}: {
  status: RequesterLifecycleStatus;
  value: number;
  href: string;
}) {
  const meta = getRequesterStatusMeta(status);

  return (
    <Link
      href={href}
      className="group rounded-2xl border bg-card/90 p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-4">
        <RequesterStatusBadge status={status} size="compact" width="fixed" />
        <span className={cn("rounded-full border p-2", meta.toneClassName)}>
          <meta.icon className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-7 flex items-end justify-between gap-4">
        <div>
          <p className="text-3xl font-semibold tracking-tight">{value}</p>
          <p className="mt-1 text-sm text-muted-foreground">{meta.label}</p>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
      </div>
    </Link>
  );
}
