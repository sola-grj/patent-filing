"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { reviewQuoteRevisionApproval } from "@/features/pm/actions/approvals";

export function PmApprovalReviewForm({ approvalId }: { approvalId: string }) {
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const [isPending, startTransition] = useTransition();

  function review(decision: "approved" | "rejected") {
    setMessage(null);
    if (decision === "rejected" && !reason.trim()) {
      setMessage("A rejection reason is required.");
      return;
    }
    startTransition(async () => {
      const formData = new FormData();
      formData.set("approvalId", approvalId);
      formData.set("decision", decision);
      formData.set("reason", reason);
      const result = await reviewQuoteRevisionApproval(formData);
      if (!result.success) {
        setMessage(result.error ?? "Unable to review approval.");
        return;
      }
      if (result.data?.warning) {
        setMessage(result.data.warning);
        setCompleted(true);
        return;
      }
      window.location.reload();
    });
  }

  return (
    <div className="mt-4 grid gap-3">
      <Textarea
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Rejection reason (required when rejecting)"
        disabled={isPending || completed}
      />
      {message ? (
        <p className={completed ? "text-sm text-amber-700" : "text-sm text-destructive"}>{message}</p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" disabled={isPending || completed} onClick={() => review("rejected")}>
          {isPending ? "Saving..." : "Reject"}
        </Button>
        <Button type="button" disabled={isPending || completed} onClick={() => review("approved")}>
          {completed ? "Decision saved" : isPending ? "Saving..." : "Approve"}
        </Button>
      </div>
    </div>
  );
}
