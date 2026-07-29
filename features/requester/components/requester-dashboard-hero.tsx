import Link from "next/link";
import { ArrowRight, Plus, Search, ShieldCheck } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  getRequesterStatusMeta,
  RequesterStatusBadge,
  type RequesterLifecycleStatus,
} from "@/features/requester/requester-status";
import { RequesterCreateRequestButton } from "./requester-create-request-button";

export function HeroSection({
  email,
  organizationName,
}: {
  email: string | null;
  organizationName: string;
}) {
  const displayName = getDisplayName(email, organizationName);
  const organizationInitials = getInitials(organizationName);

  return (
    <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-5">
        <div className="flex items-center gap-5">
          <span className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-red-500 to-orange-500 text-xl font-semibold text-white shadow-sm">
            {organizationInitials}
          </span>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-emerald-950 sm:text-4xl">
              Good morning, {displayName}
            </h1>
            <p className="mt-1 text-base text-muted-foreground">
              Here&apos;s what needs your attention today.
            </p>
          </div>
        </div>

        <form action="/requester/requests" className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-500" />
          <input
            type="search"
            name="q"
            aria-label="Search requests"
            placeholder="Search by patent, application or request number"
            className="h-[52px] w-full rounded-xl border bg-background py-3.5 pl-12 pr-4 text-sm shadow-sm outline-none transition focus:border-emerald-800 focus:ring-2 focus:ring-emerald-900/10"
          />
        </form>
      </div>

      <div className="flex flex-col justify-between gap-5 lg:items-stretch">
        <RequesterCreateRequestButton
          size="lg"
          label="New request"
          icon={<Plus className="size-5" />}
          className="h-14 w-full rounded-lg bg-emerald-950 text-base text-white shadow-sm hover:bg-emerald-900"
        />
        <div className="flex items-center gap-3 px-1 text-sm font-medium text-emerald-950">
          <ShieldCheck className="size-5" />
          <span>Patent data sources: EPO · WIPO</span>
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

function getDisplayName(email: string | null, fallback: string) {
  const accountName = email?.split("@")[0]?.trim();
  if (!accountName) return fallback;

  return accountName
    .split(/[._\-\s]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function getInitials(value: string) {
  const initials = value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  return initials || "P";
}
