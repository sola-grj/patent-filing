"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const SEARCH_DEBOUNCE_MS = 400;

type FilterOption = {
  value: string;
  label: string;
};

export type RequestListFilter = {
  name: string;
  value?: string;
  placeholder: string;
  options: FilterOption[];
};

export function RequestListFilterForm({
  basePath,
  filters,
  query,
  searchPlaceholder,
  className,
}: {
  basePath: string;
  filters: RequestListFilter[];
  query?: string;
  searchPlaceholder: string;
  className?: string;
}) {
  const router = useRouter();
  const currentSearchParams = useSearchParams();
  const [searchValue, setSearchValue] = useState(query ?? "");

  useEffect(() => {
    setSearchValue(query ?? "");
  }, [query]);

  useEffect(() => {
    const value = searchValue.trim();
    if (value === (query ?? "").trim()) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      const params = new URLSearchParams(currentSearchParams.toString());
      if (value) {
        params.set("q", value);
      } else {
        params.delete("q");
      }
      params.delete("page");
      router.replace(buildHref(basePath, params));
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [basePath, currentSearchParams, query, router, searchValue]);

  function updateFilter(name: string, value: string) {
    const params = new URLSearchParams(currentSearchParams.toString());
    if (!value || value === "all") {
      params.delete(name);
    } else {
      params.set(name, value);
    }
    params.delete("page");
    router.push(buildHref(basePath, params));
  }

  return (
    <form
      onSubmit={(event) => event.preventDefault()}
      className={cn(
        "grid shrink-0 gap-3 rounded-xl border bg-card p-5 shadow-sm",
        className,
      )}
    >
      <div className="relative min-w-0">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          name="q"
          value={searchValue}
          onChange={(event) => setSearchValue(event.target.value)}
          placeholder={searchPlaceholder}
          className="h-12 pl-10"
        />
      </div>
      {filters.map((filter) => (
        <Select
          key={filter.name}
          value={filter.value ?? "all"}
          onValueChange={(value) => updateFilter(filter.name, value)}
        >
          <SelectTrigger className="h-12 w-full">
            <SelectValue placeholder={filter.placeholder} />
          </SelectTrigger>
          <SelectContent>
            {filter.options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ))}
      <Button
        asChild
        type="button"
        variant="ghost"
        className="h-12 px-4 text-brand-soft-foreground"
      >
        <Link href={basePath}>Reset</Link>
      </Button>
    </form>
  );
}

function buildHref(basePath: string, params: URLSearchParams) {
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}
