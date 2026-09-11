"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
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
import {
  resendPmQuoteRevisionEmail,
  sendPmQuoteRevision,
} from "@/features/pm/actions";

export function PmQuoteSendAction({ quoteId, status }: { quoteId?: string; status?: string | null }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  if (!quoteId || status !== "draft") return null;
  const draftQuoteId = quoteId;

  function send() {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("quoteId", draftQuoteId);
      const result = await sendPmQuoteRevision(formData);
      setError(result.error ?? null);
      if (result.success) window.location.reload();
    });
  }

  return (
    <div className="flex items-center gap-2">
      {error ? <p className="max-w-60 text-right text-xs text-destructive">{error}</p> : null}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button type="button" className="min-w-48">Send to requester</Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send revised quotation?</AlertDialogTitle>
            <AlertDialogDescription>
              The requester will receive an in-app notification and email reminder to review and confirm this quotation.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={send} disabled={isPending}>
              {isPending ? "Sending..." : "Send quotation"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function PmQuoteResendAction({ quoteId }: { quoteId: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function resend() {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("quoteId", quoteId);
      const result = await resendPmQuoteRevisionEmail(formData);
      setMessage(result.success ? "Email resent." : result.error ?? "Email could not be resent.");
    });
  }

  return (
    <div className="flex items-center gap-3">
      <Button type="button" variant="outline" disabled={isPending} onClick={resend}>
        {isPending ? "Resending..." : "Resend email"}
      </Button>
      {message ? (
        <p className={message === "Email resent." ? "text-xs text-emerald-700" : "text-xs text-destructive"}>
          {message}
        </p>
      ) : null}
    </div>
  );
}
