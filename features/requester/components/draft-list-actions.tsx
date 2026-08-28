"use client";

import { createContext, useContext, useMemo, useState, useTransition, type ReactNode } from "react";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

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
import { Checkbox } from "@/components/ui/checkbox";
import { deleteRequesterDrafts } from "@/features/requester/actions/draft-deletion";

type DraftSelectionContextValue = {
  selectedIds: Set<string>;
  toggleDraft: (draftId: string, checked: boolean) => void;
  deleteDrafts: (draftIds: string[]) => void;
  error: string | null;
  isDeleting: boolean;
};

const DraftSelectionContext = createContext<DraftSelectionContextValue | null>(null);

export function DraftSelectionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, startDeleteTransition] = useTransition();

  const value = useMemo<DraftSelectionContextValue>(() => ({
    selectedIds,
    error,
    isDeleting,
    toggleDraft(draftId, checked) {
      setSelectedIds((current) => {
        const next = new Set(current);
        if (checked) next.add(draftId);
        else next.delete(draftId);
        return next;
      });
    },
    deleteDrafts(draftIdsToDelete) {
      setError(null);
      startDeleteTransition(async () => {
        const result = await deleteRequesterDrafts(draftIdsToDelete);
        if (!result.success) {
          setError(result.error ?? "Unable to delete drafts.");
          return;
        }
        setSelectedIds((current) => {
          const next = new Set(current);
          draftIdsToDelete.forEach((id) => next.delete(id));
          return next;
        });
        router.refresh();
      });
    },
  }), [error, isDeleting, router, selectedIds]);

  return (
    <DraftSelectionContext.Provider value={value}>
      {children}
    </DraftSelectionContext.Provider>
  );
}

export function DraftSelectionCheckbox({ draftId }: { draftId: string }) {
  const { selectedIds, toggleDraft } = useDraftSelection();
  return (
    <Checkbox
      aria-label="Select draft"
      checked={selectedIds.has(draftId)}
      onCheckedChange={(checked) => toggleDraft(draftId, checked === true)}
      onClick={(event) => event.stopPropagation()}
    />
  );
}

export function DraftBulkDeleteControl() {
  const { deleteDrafts, error, isDeleting, selectedIds } = useDraftSelection();
  const selectedCount = selectedIds.size;
  return (
    <div className="flex items-center gap-3">
      {selectedCount ? <span className="text-sm text-muted-foreground">{selectedCount} selected</span> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <DeleteDraftDialog
        count={selectedCount}
        disabled={!selectedCount || isDeleting}
        onConfirm={() => deleteDrafts([...selectedIds])}
      >
        <Button type="button" variant="destructive" disabled={!selectedCount || isDeleting}>
          <Trash2 className="size-4" />
          Delete selected
        </Button>
      </DeleteDraftDialog>
    </div>
  );
}

export function DraftDeleteButton({ draftId }: { draftId: string }) {
  const { deleteDrafts, isDeleting } = useDraftSelection();
  return (
    <DeleteDraftDialog count={1} disabled={isDeleting} onConfirm={() => deleteDrafts([draftId])}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        disabled={isDeleting}
      >
        Delete
      </Button>
    </DeleteDraftDialog>
  );
}

function DeleteDraftDialog({
  children,
  count,
  disabled,
  onConfirm,
}: {
  children: ReactNode;
  count: number;
  disabled: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {count === 1 ? "draft" : `${count} drafts`}?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently deletes the saved draft and its uploaded files. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={disabled}
            onClick={onConfirm}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function useDraftSelection() {
  const context = useContext(DraftSelectionContext);
  if (!context) throw new Error("Draft selection controls require a provider.");
  return context;
}
