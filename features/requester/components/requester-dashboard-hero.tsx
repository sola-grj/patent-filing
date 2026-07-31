import Link from "next/link";
import { ArrowRight, Plus, Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { TimeAwareGreeting } from "@/components/time-aware-greeting";
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
    <section className="space-y-5">
      <div className="grid items-center gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex items-center gap-5">
          <span className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-brand text-xl font-semibold text-brand-foreground shadow-sm">
            {organizationInitials}
          </span>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              <TimeAwareGreeting displayName={displayName} />
            </h1>
            <p className="mt-1 text-base text-muted-foreground">
              Here&apos;s what needs your attention today.
            </p>
          </div>
        </div>

        <RequesterCreateRequestButton
          size="lg"
          label="New request"
          icon={<Plus className="size-5" />}
          className="h-14 w-full rounded-lg bg-brand text-base text-brand-foreground shadow-sm hover:bg-brand-hover"
        />
      </div>

      <form action="/requester/requests" className="relative w-full">
        <input type="hidden" name="from" value="dashboard" />
        <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          name="q"
          required
          aria-label="Search requests"
          placeholder="Search by patent, application or request number"
          className="h-[52px] w-full rounded-xl border bg-card py-3.5 pl-12 pr-4 text-sm shadow-sm outline-none transition focus:border-brand-border focus:ring-2 focus:ring-brand-ring/15"
        />
      </form>
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
