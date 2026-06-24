"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { submitCloseRequestFromPm } from "@/features/pm/actions";

export function PmCloseRequestDialog({ requestId }: { requestId: string }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="destructive">Close request</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Close request</DialogTitle>
          <DialogDescription>
            Closing this request will move both PM and requester status to rejected.
          </DialogDescription>
        </DialogHeader>
        <form action={submitCloseRequestFromPm} className="space-y-4">
          <input type="hidden" name="requestId" value={requestId} />
          <label className="block space-y-2 text-sm">
            <span className="font-medium">Reason</span>
            <textarea
              name="reason"
              required
              rows={4}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="Explain why this request is being closed."
            />
          </label>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" variant="destructive">
              Confirm close
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
