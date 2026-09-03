"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { History, Search } from "lucide-react";
import { useEffect, useState } from "react";

import { TimeAwareGreeting } from "@/components/time-aware-greeting";
import { resolveDashboardSearchDestination } from "@/features/requester/actions";
import { useRequesterNavigationLoading } from "./requester-navigation-loading";

export function HeroSection({
  email,
  organizationName,
  recentSearches,
}: {
  email: string | null;
  organizationName: string;
  recentSearches: string[];
}) {
  const pathname = usePathname();
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const { navigate, startNavigationLoading, stopNavigationLoading } = useRequesterNavigationLoading();
  const displayName = getDisplayName(email, organizationName);

  useEffect(() => {
    setIsSearching(false);
    if (pathname === "/requester") {
      setSearchQuery("");
    }
  }, [pathname]);

  async function startSearch(query: string) {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) return;

    setIsSearching(true);
    startNavigationLoading();
    const result = await resolveDashboardSearchDestination(normalizedQuery);
    if (result.success && result.data?.href) {
      setSearchQuery("");
      navigate(result.data.href);
      return;
    }

    setIsSearching(false);
    stopNavigationLoading();
  }

  return (
    <section className="w-full max-w-[980px] text-center">
      <p className="text-base font-medium text-muted-foreground sm:text-lg">
        <TimeAwareGreeting displayName={displayName} />
      </p>
      <h1 className="mt-5 text-4xl font-bold tracking-[-0.035em] text-foreground sm:text-5xl">
        Pat&apos;s on the case.
      </h1>
      <p className="mt-5 text-base text-muted-foreground sm:text-lg">
        Find patent records, applications, references, and service requests in one place.
      </p>

      <form
        className="mt-8 flex flex-col gap-2 rounded-xl border bg-card p-2 text-left shadow-[0_10px_35px_rgba(31,41,55,0.09)] sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          void startSearch(searchQuery);
        }}
      >
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Search patents and requests</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-6 -translate-y-1/2 text-muted-foreground/70 sm:left-2" />
          <input
            type="search"
            name="q"
            required
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search by publication no., application no., reference no., or request no."
            className="h-14 w-full bg-transparent pl-12 pr-3 text-base outline-none placeholder:text-muted-foreground/75"
          />
        </label>
        <button
          type="submit"
          disabled={isSearching}
          className="h-14 rounded-lg bg-brand px-10 text-base font-semibold text-brand-foreground shadow-sm transition-colors hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring sm:min-w-36"
        >
          Search
        </button>
      </form>

      {recentSearches.length ? (
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {recentSearches.map((query) => (
            <Link
              key={query}
              href={`/requester/requests?${new URLSearchParams({ from: "dashboard", q: query })}`}
              onClick={(event) => {
                event.preventDefault();
                void startSearch(query);
              }}
              className="inline-flex h-10 items-center gap-2 rounded-full border bg-background/70 px-4 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-card"
            >
              <History className="size-4" />
              {query}
            </Link>
          ))}
        </div>
      ) : null}
    </section>
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
