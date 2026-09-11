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
import { submitQuoteRevisionApproval } from "@/features/pm/actions/approvals";

type QuoteApproval = { id: string; status: string; decision_reason?: string | null; sent_at?: string | null };

export function PmQuoteSendAction({ quoteId, status, approval }: { quoteId?: string; status?: string | null; approval?: QuoteApproval | null }) {
  const [error, setError] = useState<string | null>(null);
  const [completedWithWarning, setCompletedWithWarning] = useState<"submitted" | "sent" | null>(null);
  const [isPending, startTransition] = useTransition();
  if (!quoteId || status !== "draft") return null;
  const draftQuoteId = quoteId;

  function send() {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("quoteId", draftQuoteId);
      const result = await sendPmQuoteRevision(formData);
      setError(result.error ?? null);
      if (result.success && result.data?.warning) {
        setError(result.data.warning);
        setCompletedWithWarning("sent");
      } else if (result.success) window.location.reload();
    });
  }

  function submit() {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("quoteId", draftQuoteId);
      const result = await submitQuoteRevisionApproval(formData);
      setError(result.error ?? result.data?.warning ?? null);
      if (result.success && result.data?.warning) {
        setCompletedWithWarning("submitted");
      } else if (result.success) window.location.reload();
    });
  }

  if (completedWithWarning) {
    return (
      <div className="flex items-center gap-2">
        <p className="max-w-80 text-right text-xs text-amber-700">{error}</p>
        <Button type="button" className="min-w-48" disabled>
          {completedWithWarning === "sent" ? "Sent" : "Pending approval"}
        </Button>
      </div>
    );
  }

  if (approval?.status === "pending") {
    return <Button type="button" className="min-w-48" disabled>Pending approval</Button>;
  }

  if (approval?.status !== "approved") {
    return (
      <div className="flex items-center gap-2">
        {error ? <p className="max-w-72 text-right text-xs text-destructive">{error}</p> : null}
        <Button type="button" className="min-w-48" disabled={isPending} onClick={submit}>
          {isPending ? "Submitting..." : approval?.status === "rejected" ? "Resubmit" : "Submit"}
        </Button>
      </div>
    );
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
