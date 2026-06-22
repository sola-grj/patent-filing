"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { buildFreshRequestHref, NEW_REQUEST_PATH } from "@/features/requester/requester-routes";
import { useRequestWizardController } from "./requester-create-request-controller";

export function RequesterCreateRequestButton() {
  const pathname = usePathname();
  const router = useRouter();
  const { controller } = useRequestWizardController();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);

  function startFreshRequest() {
    if (pathname === NEW_REQUEST_PATH && controller) {
      controller.resetToStart();
      return;
    }

    router.push(buildFreshRequestHref());
  }

  function handleClick() {
    if (controller?.isDirty) {
      setDialogOpen(true);
      return;
    }

    startFreshRequest();
  }

  async function handleSaveDraft() {
    if (!controller) return;

    setIsSavingDraft(true);
    const saved = await controller.saveDraftAndReset();
    setIsSavingDraft(false);

    if (saved) {
      setDialogOpen(false);
      startFreshRequest();
    }
  }

  function handleDiscardAndRestart() {
    setDialogOpen(false);
    startFreshRequest();
  }

  return (
    <>
      <Button type="button" size="sm" onClick={handleClick}>
        Create Request
      </Button>
      <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Start a new request?</AlertDialogTitle>
            <AlertDialogDescription>
              You already have an in-progress request. Save it as a draft before returning to step 1.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSavingDraft}>Keep editing</AlertDialogCancel>
            <Button type="button" variant="outline" disabled={isSavingDraft} onClick={handleDiscardAndRestart}>
              Start over
            </Button>
            <Button type="button" disabled={isSavingDraft} onClick={() => void handleSaveDraft()}>
              {isSavingDraft ? "Saving..." : "Save draft"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
