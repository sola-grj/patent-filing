"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { initializeRequesterWorkspace } from "@/features/requester/actions";

export function WorkspaceSetupForm() {
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();

  return (
    <Card className="w-full max-w-xl shadow-sm">
      <CardHeader>
        <CardTitle>Initialize your Patentia workspace</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            const validationErrors = validateWorkspaceForm(formData);

            setFieldErrors(validationErrors);
            setError(null);

            if (Object.keys(validationErrors).length) {
              return;
            }

            startTransition(async () => {
              const result = await initializeRequesterWorkspace(formData);
              setError(result.error ?? null);
              if (result.success) {
                window.location.reload();
              }
            });
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="organizationName">Organization name</Label>
            <Input
              id="organizationName"
              name="organizationName"
              placeholder="Acme IP Team"
              aria-invalid={Boolean(fieldErrors.organizationName)}
              disabled={isPending}
              minLength={2}
              required
            />
            {fieldErrors.organizationName ? (
              <p className="text-sm text-destructive">{fieldErrors.organizationName}</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="displayName">Display name</Label>
            <Input
              id="displayName"
              name="displayName"
              placeholder="Requester name"
              aria-invalid={Boolean(fieldErrors.displayName)}
              disabled={isPending}
              minLength={2}
              required
            />
            {fieldErrors.displayName ? (
              <p className="text-sm text-destructive">{fieldErrors.displayName}</p>
            ) : null}
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" disabled={isPending}>
            {isPending ? "Creating..." : "Create workspace"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function validateWorkspaceForm(formData: FormData) {
  const errors: Record<string, string> = {};
  const organizationName = String(formData.get("organizationName") ?? "").trim();
  const displayName = String(formData.get("displayName") ?? "").trim();

  if (organizationName.length < 2) {
    errors.organizationName = "Enter an organization name.";
  }

  if (displayName.length < 2) {
    errors.displayName = "Enter your display name.";
  }

  return errors;
}
