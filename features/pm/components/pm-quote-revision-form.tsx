"use client";

import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { revisePmQuotationFormState, type PmQuoteRevisionRow } from "@/features/pm/actions";
import { requestPmQuotation } from "@/features/pm/erp-browser";
import { PmQuoteSendAction } from "./pm-quote-send-action";
import type { ActionResult } from "@/lib/validators/requester";

type RevisionRow = PmQuoteRevisionRow;

const initialState: ActionResult<{ quoteId: string }> = { success: false };

type RevisionQuote = {
  id?: string;
  status?: string | null;
  breakdown_json?: unknown;
  pricing_snapshot?: unknown;
};

export function PmQuoteRevisionDialog({
  quote,
  descriptionWordCount,
  requestId,
  requestStage,
}: {
  quote: RevisionQuote | null;
  descriptionWordCount: number;
  requestId: string;
  requestStage?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [draftQuoteId, setDraftQuoteId] = useState(
    quote?.status === "draft" ? quote.id : undefined,
  );
  const rows = revisionRows(quote);
  const latestAdjustedDescriptionWords = adjustedDescriptionWords(quote, descriptionWordCount);
  const latestDiscountPercent = translationDiscountPercent(quote);
  const latestTranslationFeeBeforeDiscount = translationFeeBeforeDiscount(quote);
  const isCompleted = requestStage === "completed";
  const isPendingConfirmation = quote?.status === "sent";
  const cannotRevise = !quote || !rows.length || !Number.isInteger(descriptionWordCount) || descriptionWordCount < 0;
  const disabled = isCompleted || isPendingConfirmation || cannotRevise;
  const reason = isCompleted
    ? "Completed Requests cannot be repriced."
    : isPendingConfirmation
      ? "Waiting for customer confirmation of the latest quotation."
      : cannotRevise
        ? "This quotation cannot be revised because its ERP pricing snapshot or description word count is unavailable."
        : null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="icon" disabled={disabled} aria-label="Edit quotation" title={reason ?? "Edit quotation"}>
          <Pencil className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100vh-4rem)] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Revise quotation</DialogTitle>
          <DialogDescription>
            Save the revision for review. You can send it to the Request creator only after PM confirmation.
          </DialogDescription>
        </DialogHeader>
        <PmQuoteRevisionFormFields
          descriptionWordCount={latestAdjustedDescriptionWords}
          initialDiscountPercent={latestDiscountPercent}
          initialTranslationFeeBeforeDiscount={latestTranslationFeeBeforeDiscount}
          requestId={requestId}
          rows={rows}
          draftQuoteId={draftQuoteId}
          onSavedQuote={setDraftQuoteId}
        />
      </DialogContent>
    </Dialog>
  );
}

export function PmQuoteRevisionFormFields({
  descriptionWordCount,
  initialDiscountPercent,
  initialTranslationFeeBeforeDiscount,
  requestId,
  rows,
  draftQuoteId,
  onSavedQuote,
}: {
  descriptionWordCount: number;
  initialDiscountPercent: number;
  initialTranslationFeeBeforeDiscount: number | null;
  requestId: string;
  rows: RevisionRow[];
  draftQuoteId?: string;
  onSavedQuote: (quoteId: string) => void;
}) {
  const [state, formAction, isPending] = useActionState(revisePmQuotationFormState, initialState);
  const [adjustedRows, setAdjustedRows] = useState(rows);
  const [discountPercent, setDiscountPercent] = useState(String(initialDiscountPercent));
  const [translationFeesAreDiscounted, setTranslationFeesAreDiscounted] = useState(initialDiscountPercent > 0);
  const [calculationError, setCalculationError] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isCalculating, startCalculation] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const totals = useMemo(
    () => revisionTotals(adjustedRows, discountPercent, translationFeesAreDiscounted, initialTranslationFeeBeforeDiscount),
    [adjustedRows, discountPercent, initialTranslationFeeBeforeDiscount, translationFeesAreDiscounted],
  );

  useEffect(() => {
    if (state.success && state.data?.quoteId) {
      onSavedQuote(state.data.quoteId);
      setHasUnsavedChanges(false);
    }
  }, [onSavedQuote, state.data?.quoteId, state.success]);

  return (
    <form action={formAction} className="space-y-4" ref={formRef}>
      <input type="hidden" name="requestId" value={requestId} />
      <div className="grid gap-3 md:grid-cols-2">
        <LabeledInput label="Adjusted description words" name="descriptionWordCount" type="number" min="0" step="1" defaultValue={String(descriptionWordCount)} onChange={() => setHasUnsavedChanges(true)} required />
        <LabeledInput label="Translation fee discount (%)" name="translationDiscountPercent" type="number" min="0" max="100" step="0.01" value={discountPercent} onChange={(event) => { setDiscountPercent(event.target.value); setHasUnsavedChanges(true); }} required />
      </div>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-muted/40 text-left"><tr><th className="p-3">Country</th><th className="p-3">Official fee</th><th className="p-3">Service fee</th><th className="p-3">Translate fee</th></tr></thead>
          <tbody>{adjustedRows.map((row) => (
            <tr key={row.countryId} className="border-t">
              <td className="p-3 font-medium">{row.countryName}</td>
              <td className="p-3"><input className="h-9 w-28 rounded-md border bg-background px-2" name={`officialFee-${row.countryId}`} type="number" min="0" step="0.01" value={row.officialFee} onChange={(event) => { updateFee(setAdjustedRows, row.countryId, "officialFee", event.target.value); setHasUnsavedChanges(true); }} required /></td>
              <td className="p-3"><input className="h-9 w-28 rounded-md border bg-background px-2" name={`serviceFee-${row.countryId}`} type="number" min="0" step="0.01" value={row.serviceFee} onChange={(event) => { updateFee(setAdjustedRows, row.countryId, "serviceFee", event.target.value); setHasUnsavedChanges(true); }} required /></td>
              <td className="p-3"><input className="h-9 w-28 rounded-md border bg-background px-2" name={`translationFee-${row.countryId}`} type="number" min="0" step="0.01" value={row.translationFee} onChange={(event) => { updateFee(setAdjustedRows, row.countryId, "translationFee", event.target.value); setHasUnsavedChanges(true); }} required /></td>
            </tr>
          ))}</tbody>
          <tfoot className="border-t bg-muted/20 font-semibold">
            <tr>
              <td colSpan={4} className="p-0">
                <div className="ml-auto grid w-fit grid-cols-[minmax(15rem,1fr)_max-content] items-center gap-x-6 gap-y-3 px-3 py-4">
                  <SummaryLine label="Official Fee Subtotal" value={formatAmount(totals.officialFee)} />
                  <SummaryLine label="Service Fee Subtotal" value={formatAmount(totals.serviceFee)} />
                  <SummaryLine
                    label={<span className="flex items-center gap-2">Translation Fee Subtotal{totals.discount > 0 ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-950">{formatDiscount(totals.discount)} discount</span> : null}</span>}
                    value={totals.discount > 0 ? <span className="flex justify-end gap-2"><span className="text-muted-foreground line-through">{formatAmount(totals.translationBeforeDiscount)}</span>{formatAmount(totals.translationFee)}</span> : formatAmount(totals.translationFee)}
                  />
                  <SummaryLine label="Quotation Total" value={formatAmount(totals.total)} final />
                </div>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <label className="block space-y-2 text-sm">
        <span className="font-medium">Adjustment reason</span>
        <Textarea name="adjustmentNotes" required className="min-h-24 w-full resize-y" onChange={() => setHasUnsavedChanges(true)} />
      </label>
      {state.error ? <p role="alert" className="text-sm text-destructive">{state.error}</p> : null}
      {calculationError ? <p role="alert" className="text-sm text-destructive">{calculationError}</p> : null}
      {state.success && !hasUnsavedChanges ? <p className="text-sm text-emerald-700">Revision saved as a draft. Review it, then send it to the requester.</p> : null}
      <div className="flex flex-wrap items-center justify-end gap-3 border-t pt-4">
        <Button type="button" variant="outline" className="min-w-44" disabled={isPending || isCalculating} onClick={() => {
          if (!formRef.current || !reportCalculationValidity(formRef.current)) return;
          const formData = new FormData(formRef.current);
          setCalculationError(null);
          startCalculation(async () => {
            const result = await requestPmQuotation(formData);
            if (!result.success) {
              setCalculationError(result.error ?? "Unable to calculate the quotation.");
              return;
            }
            setAdjustedRows(result.data.rows.map((row) => ({
              countryId: row.countryId,
              countryName: row.countryName,
              officialFee: row.officialFee,
              serviceFee: row.serviceFee,
              translationFee: row.translationFee,
            })));
            setTranslationFeesAreDiscounted(false);
            setHasUnsavedChanges(true);
          });
        }}>{isCalculating ? "Calculating quotation..." : "Calculate quotation"}</Button>
        <Button type="submit" className="min-w-48" disabled={isPending || !hasUnsavedChanges}>{isPending ? "Saving quotation..." : "Save revised quotation"}</Button>
        {draftQuoteId ? <PmQuoteSendAction quoteId={draftQuoteId} status="draft" /> : null}
      </div>
    </form>
  );
}

function SummaryLine({ label, value, final = false }: { label: React.ReactNode; value: React.ReactNode; final?: boolean }) {
  return (
    <>
      <div className={final ? "text-base" : undefined}>{label}</div>
      <div className={final ? "whitespace-nowrap text-right text-base" : "whitespace-nowrap text-right"}>{value}</div>
    </>
  );
}

function updateFee(
  setRows: React.Dispatch<React.SetStateAction<RevisionRow[]>>,
  countryId: number,
  key: "officialFee" | "serviceFee" | "translationFee",
  value: string,
) {
  const amount = Number(value);
  setRows((current) => current.map((row) => row.countryId === countryId
    ? { ...row, [key]: Number.isFinite(amount) && amount >= 0 ? amount : 0 }
    : row));
}

function revisionTotals(
  rows: RevisionRow[],
  discountValue: string,
  translationFeesAreDiscounted: boolean,
  savedTranslationFeeBeforeDiscount: number | null,
) {
  const officialFee = rows.reduce((sum, row) => sum + row.officialFee, 0);
  const serviceFee = rows.reduce((sum, row) => sum + row.serviceFee, 0);
  const rowTranslationFee = rows.reduce((sum, row) => sum + row.translationFee, 0);
  const discount = Math.min(100, Math.max(0, Number(discountValue) || 0));
  const translationBeforeDiscount = translationFeesAreDiscounted
    ? savedTranslationFeeBeforeDiscount ?? (discount < 100 ? roundMoney(rowTranslationFee / (1 - discount / 100)) : rowTranslationFee)
    : rowTranslationFee;
  const translationFee = translationFeesAreDiscounted
    ? rowTranslationFee
    : roundMoney(translationBeforeDiscount * (1 - discount / 100));
  return { officialFee, serviceFee, translationBeforeDiscount, translationFee, discount, total: roundMoney(officialFee + serviceFee + translationFee) };
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function formatAmount(value: number) {
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDiscount(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value) + "%";
}

function reportCalculationValidity(form: HTMLFormElement) {
  return Array.from(form.querySelectorAll<HTMLInputElement>("input[required]")).every((input) => input.reportValidity());
}

function LabeledInput(props: React.ComponentProps<"input"> & { label: string }) {
  const { label, ...inputProps } = props;
  return <label className="block space-y-2 text-sm"><span className="font-medium">{label}</span><input className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm disabled:bg-muted" {...inputProps} /></label>;
}

function revisionRows(quote: RevisionQuote | null): RevisionRow[] {
  const snapshot = quote?.breakdown_json ?? quote?.pricing_snapshot;
  const response = snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)
    ? (snapshot as { response?: unknown }).response
    : null;
  if (!Array.isArray(response)) return [];
  return response.flatMap((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return [];
    const value = row as Record<string, unknown>;
    const countryId = Number(value.countryId);
    const countryName = typeof value.countryName === "string" ? value.countryName : null;
    const officialFee = Number(value.officialFee);
    const serviceFee = Number(value.serviceFee);
    const translationFee = Number(value.translationFee);
    return Number.isInteger(countryId) && countryName && [officialFee, serviceFee, translationFee].every(Number.isFinite)
      ? [{ countryId, countryName, officialFee, serviceFee, translationFee }]
      : [];
  });
}

function adjustedDescriptionWords(quote: RevisionQuote | null, fallback: number) {
  const snapshot = quote?.breakdown_json ?? quote?.pricing_snapshot;
  const revision = snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)
    ? (snapshot as { revision?: unknown }).revision
    : null;
  const amount = revision && typeof revision === "object" && !Array.isArray(revision)
    ? Number((revision as { adjustedDescriptionWords?: unknown }).adjustedDescriptionWords)
    : Number.NaN;
  return Number.isInteger(amount) && amount >= 0 ? amount : fallback;
}

function translationDiscountPercent(quote: RevisionQuote | null) {
  const snapshot = quote?.breakdown_json ?? quote?.pricing_snapshot;
  const revision = snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)
    ? (snapshot as { revision?: unknown }).revision
    : null;
  const amount = revision && typeof revision === "object" && !Array.isArray(revision)
    ? Number((revision as { translationDiscountPercent?: unknown }).translationDiscountPercent)
    : Number.NaN;
  return Number.isFinite(amount) && amount >= 0 && amount <= 100 ? amount : 0;
}

function translationFeeBeforeDiscount(quote: RevisionQuote | null) {
  const snapshot = quote?.breakdown_json ?? quote?.pricing_snapshot;
  const revision = snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)
    ? (snapshot as { revision?: unknown }).revision
    : null;
  const amount = revision && typeof revision === "object" && !Array.isArray(revision)
    ? Number((revision as { translationFeeBeforeDiscount?: unknown }).translationFeeBeforeDiscount)
    : Number.NaN;
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}
