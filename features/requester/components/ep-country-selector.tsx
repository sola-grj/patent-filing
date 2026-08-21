"use client";

import { Check, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { EpCountryOption } from "@/features/requester/wizard-types";

export function EpCountrySelector({
  title,
  description,
  options,
  values,
  confirmed,
  error,
  disabled = false,
  onChange,
  onConfirm,
}: {
  title: string;
  description?: string;
  options: EpCountryOption[];
  values: number[];
  confirmed: boolean;
  error?: string;
  disabled?: boolean;
  onChange: (values: number[]) => void;
  onConfirm: () => void;
}) {
  const [query, setQuery] = useState("");
  const filteredOptions = useMemo(
    () => options.filter((option) => matchesCountry(option, query)),
    [options, query],
  );

  function toggleCountry(id: number) {
    onChange(values.includes(id)
      ? values.filter((value) => value !== id)
      : [...values, id]);
  }

  return (
    <section className="space-y-3 rounded-xl border bg-muted/10 p-4 md:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          {description ? (
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{values.length} selected</span>
          {confirmed ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 font-medium text-emerald-700">
              <Check className="h-3 w-3" /> Confirmed
            </span>
          ) : null}
        </div>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          disabled={disabled}
          onChange={(event) => setQuery(event.target.value)}
          className="pl-9"
          placeholder="Search by English name, Chinese name, abbreviation, or code..."
        />
      </div>

      <div className="grid max-h-72 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
        {filteredOptions.map((option) => {
          const selected = values.includes(option.id);
          return (
            <button
              key={option.id}
              type="button"
              disabled={disabled}
              aria-pressed={selected}
              onClick={() => toggleCountry(option.id)}
              className={`rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                selected
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-background hover:border-primary/50 hover:bg-muted/50"
              } disabled:cursor-not-allowed disabled:opacity-60`}
            >
              <span className="block truncate font-medium">
                {option.name} ({option.abbr})
              </span>
              {option.cname ? (
                <span className={`block truncate text-xs ${selected ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                  {option.cname}
                </span>
              ) : null}
            </button>
          );
        })}
        {!filteredOptions.length ? (
          <p className="col-span-full rounded-md border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">
            No matching countries.
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={disabled || !values.length}
            onClick={() => onChange([])}
          >
            Clear
          </Button>
          <Button
            type="button"
            disabled={disabled || !values.length}
            onClick={onConfirm}
          >
            Confirm selection
          </Button>
        </div>
      </div>
    </section>
  );
}

function matchesCountry(option: EpCountryOption, query: string) {
  const tokens = normalize(query).split(" ").filter(Boolean);
  if (!tokens.length) return true;
  const haystack = normalize(`${option.name} ${option.cname} ${option.abbr} ${option.id}`);
  const compact = haystack.replaceAll(" ", "");
  return tokens.every((token) =>
    haystack.includes(token) || compact.includes(token.replaceAll(" ", ""))
  );
}

function normalize(value: string) {
  return value.normalize("NFKD").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
