"use client";

import { useState, useTransition } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  acceptPmNegotiationQuote,
  acceptQuote,
  negotiateQuote,
  rejectQuote,
} from "@/features/requester/actions";
import { rejectReasonOptions } from "@/features/requester/options";

export function QuoteActions({
  acceptLabel = "Accept quote",
  acceptMode = "quote",
  canAccept = true,
  negotiationId,
  requestId,
  quoteId,
}: {
  acceptLabel?: string;
  acceptMode?: "quote" | "pm-negotiation";
  canAccept?: boolean;
  negotiationId?: string;
  requestId: string;
  quoteId: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run(action: (formData: FormData) => Promise<{ success: boolean; error?: string }>, formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await action(formData);
      setError(result.error ?? null);
      if (result.success) window.location.reload();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {canAccept ? (
          <Button
            disabled={isPending}
            onClick={() => {
              const formData = baseFormData(requestId, quoteId);
              if (acceptMode === "pm-negotiation") {
                if (!negotiationId) {
                  setError("Negotiation context is required.");
                  return;
                }

                formData.set("negotiationId", negotiationId);
                run(acceptPmNegotiationQuote, formData);
                return;
              }

              run(acceptQuote, formData);
            }}
          >
            {acceptLabel}
          </Button>
        ) : null}
        <RejectDialog disabled={isPending} onSubmit={(formData) => run(rejectQuote, formData)} quoteId={quoteId} requestId={requestId} />
        <NegotiateDialog disabled={isPending} onSubmit={(formData) => run(negotiateQuote, formData)} quoteId={quoteId} requestId={requestId} />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

function RejectDialog({
  disabled,
  requestId,
  quoteId,
  onSubmit,
}: {
  disabled: boolean;
  requestId: string;
  quoteId: string;
  onSubmit: (formData: FormData) => void;
}) {
  const [reason, setReason] = useState(rejectReasonOptions[0]);

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" disabled={disabled}>Reject</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reject this quote?</AlertDialogTitle>
          <AlertDialogDescription>
            The request will be closed unless you later create a new request.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Select value={reason} onValueChange={setReason}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
          {rejectReasonOptions.map((option) => (
            <SelectItem key={option} value={option}>{option}</SelectItem>
          ))}
          </SelectContent>
        </Select>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              const formData = baseFormData(requestId, quoteId);
              formData.set("reason", reason);
              onSubmit(formData);
            }}
          >
            Reject quote
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function NegotiateDialog({
  disabled,
  requestId,
  quoteId,
  onSubmit,
}: {
  disabled: boolean;
  requestId: string;
  quoteId: string;
  onSubmit: (formData: FormData) => void;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={disabled}>Negotiate</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start negotiation</DialogTitle>
        </DialogHeader>
        <form className="space-y-4" action={onSubmit}>
          <input type="hidden" name="requestId" value={requestId} />
          <input type="hidden" name="quoteId" value={quoteId} />
          <div className="space-y-2">
            <Label htmlFor="expectedAmount">Expected price</Label>
            <Input id="expectedAmount" name="expectedAmount" type="number" min="0" step="1" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="expectedDeliveryAt">Expected delivery date</Label>
            <Input id="expectedDeliveryAt" name="expectedDeliveryAt" type="date" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="adjustmentNotes">Adjustment notes</Label>
            <Input id="adjustmentNotes" name="adjustmentNotes" placeholder="Scope, delivery, or pricing adjustment" />
          </div>
          <Button type="submit">Submit negotiation</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function baseFormData(requestId: string, quoteId: string) {
  const formData = new FormData();
  formData.set("requestId", requestId);
  formData.set("quoteId", quoteId);
  return formData;
}
