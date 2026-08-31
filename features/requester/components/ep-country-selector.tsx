"use client";

import { ChevronRight, Search } from "lucide-react";
import { useMemo, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EpCountryOption } from "@/features/requester/wizard-types";

export function EpCountrySelector({
  title,
  description,
  options,
  values,
  error,
  disabled = false,
  className,
  onChange,
}: {
  title: string;
  description?: string;
  options: EpCountryOption[];
  values: number[];
  error?: string;
  disabled?: boolean;
  className?: string;
  onChange: (values: number[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pendingValues, setPendingValues] = useState<number[]>(values);
  const filteredOptions = useMemo(
    () => options.filter((option) => matchesCountry(option, query)),
    [options, query],
  );
  const selectedOptions = useMemo(
    () => options.filter((option) => values.includes(option.id)),
    [options, values],
  );

  function toggleCountry(id: number) {
    setPendingValues((current) => current.includes(id)
      ? current.filter((value) => value !== id)
      : [...current, id]);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setPendingValues(values);
      setQuery("");
    }
    setOpen(nextOpen);
  }

  function confirmSelection() {
    onChange(pendingValues);
    setOpen(false);
  }

  function selectAllOptions() {
    setPendingValues(options.map((option) => option.id));
  }

  return (
    <section className={`flex h-full flex-col gap-3 ${className ?? "md:col-span-2"}`}>
      <div>
        <Label>
          <span className="text-destructive" aria-hidden="true">*</span>{" "}
          {title}
        </Label>
        {description ? (
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>

      <button
        type="button"
        disabled={disabled}
        onClick={() => handleOpenChange(true)}
        className="flex w-full flex-1 flex-col items-stretch gap-2 rounded-lg border border-brand-border/30 bg-white px-4 py-3 text-left text-sm transition-colors hover:border-brand-border disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="flex items-center justify-between gap-3">
          <span className="font-medium">
            {values.length ? `Selected ${title}` : `Choose ${title}`}
          </span>
          <span className="flex shrink-0 items-center gap-2 font-semibold text-brand-soft-foreground">
            {values.length} selected
            <ChevronRight className="size-4" aria-hidden="true" />
          </span>
        </span>
        {selectedOptions.length ? (
          <span className="flex flex-wrap gap-1.5" aria-label={`Selected ${title}`}>
            {selectedOptions.map((option) => {
              const flagCountryCode = resolveFlagCountryCode(option);
              return (
                <span
                  key={option.id}
                  className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs text-foreground"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`https://flagcdn.com/20x15/${flagCountryCode}.png`}
                    srcSet={`https://flagcdn.com/40x30/${flagCountryCode}.png 2x`}
                    width="16"
                    height="12"
                    alt=""
                    className="shrink-0 rounded-[2px] object-cover"
                  />
                  {option.name} ({option.abbr})
                </span>
              );
            })}
          </span>
        ) : null}
      </button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Choose {title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" disabled={disabled || !options.length} onClick={selectAllOptions}>
                Select all countries
              </Button>
              <Button type="button" variant="ghost" size="sm" disabled={disabled || !pendingValues.length} onClick={() => setPendingValues([])}>
                Clear selection
              </Button>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                disabled={disabled}
                onChange={(event) => setQuery(event.target.value)}
                className="pl-9"
                placeholder="Search by English name, abbreviation, or code..."
              />
            </div>

            <div className="grid max-h-[60vh] gap-2 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
              {filteredOptions.map((option) => {
                const selected = pendingValues.includes(option.id);
                const flagCountryCode = resolveFlagCountryCode(option);
                return (
                  <button
                    key={option.id}
                    type="button"
                    disabled={disabled}
                    aria-pressed={selected}
                    onClick={() => toggleCountry(option.id)}
                    className={`rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                      selected
                        ? "border-brand bg-brand text-brand-foreground hover:bg-brand-hover"
                        : "bg-background hover:border-brand-border/50 hover:bg-brand-soft/40"
                    } disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    <span className="flex items-center gap-2 font-medium">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`https://flagcdn.com/20x15/${flagCountryCode}.png`}
                        srcSet={`https://flagcdn.com/40x30/${flagCountryCode}.png 2x`}
                        width="20"
                        height="15"
                        alt=""
                        className="shrink-0 rounded-[2px] object-cover"
                      />
                      <span className="truncate">
                        {option.name} ({option.abbr})
                      </span>
                    </span>
                  </button>
                );
              })}
              {!filteredOptions.length ? (
                <p className="col-span-full rounded-md border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">
                  No matching countries.
                </p>
              ) : null}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" onClick={confirmSelection}>
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </section>
  );
}

function matchesCountry(option: EpCountryOption, query: string) {
  const tokens = normalize(query).split(" ").filter(Boolean);
  if (!tokens.length) return true;
  const haystack = normalize(`${option.name} ${option.abbr} ${option.id}`);
  const compact = haystack.replaceAll(" ", "");
  return tokens.every((token) =>
    haystack.includes(token) || compact.includes(token.replaceAll(" ", ""))
  );
}

function normalize(value: string) {
  return value.normalize("NFKD").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function resolveFlagCountryCode(option: EpCountryOption) {
  const specialCountryCodes: Record<number, string> = {
    170: "gb",
    189: "ba",
    201: "me",
    1001: "eu",
  };
  return specialCountryCodes[option.id] ?? option.abbr.toLowerCase();
}
