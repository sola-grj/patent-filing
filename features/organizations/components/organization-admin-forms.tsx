"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createCustomerOrganization,
  inviteOrganizationMember,
  resetErpCustomerPassword,
} from "@/features/organizations/actions";
import { initialOrganizationActionState } from "@/features/organizations/types";

export function CreateCustomerOrganizationForm() {
  const [state, action, pending] = useActionState(
    createCustomerOrganization,
    initialOrganizationActionState,
  );

  return (
    <form action={action} className="grid gap-4 rounded-xl border bg-card p-5">
      <div>
        <h2 className="font-semibold">Create customer organization</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The customer will be linked to ECI and Request sharing will be off.
        </p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="customer-name">Organization name</Label>
        <Input id="customer-name" name="name" required />
      </div>
      {state.message ? <ActionMessage state={state} /> : null}
      {state.organizationId ? (
        <Link className="text-sm font-medium text-primary underline" href={`/pm/customers/${state.organizationId}`}>
          Open customer and invite its first administrator
        </Link>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Creating..." : "Create customer organization"}
      </Button>
    </form>
  );
}

export function InviteOrganizationMemberForm({
  organizationId,
  organizationName,
}: {
  organizationId: string;
  organizationName: string;
}) {
  const [state, action, pending] = useActionState(
    inviteOrganizationMember,
    initialOrganizationActionState,
  );

  return (
    <form action={action} className="grid gap-4 rounded-xl border bg-card p-5">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="organizationName" value={organizationName} />
      <div>
        <h2 className="font-semibold">Invite member</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The invitation is bound to the email address and this organization.
        </p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`invite-email-${organizationId}`}>Email</Label>
        <Input id={`invite-email-${organizationId}`} name="email" type="email" required />
      </div>
      <label className="flex items-start gap-3 text-sm">
        <input className="mt-1 h-4 w-4" type="checkbox" name="isAdmin" />
        <span>
          Customer administrator
          <span className="block text-muted-foreground">
            Can invite and view members. This does not enable Request sharing.
          </span>
        </span>
      </label>
      {state.message ? <ActionMessage state={state} /> : null}
      {state.invitationLink ? (
        <div className="grid gap-2 rounded-md border border-primary/30 bg-primary/5 p-3">
          <Label htmlFor={`invite-link-${organizationId}`}>Copy this link now</Label>
          <Input id={`invite-link-${organizationId}`} readOnly value={state.invitationLink} onFocus={(event) => event.currentTarget.select()} />
          <p className="text-xs text-muted-foreground">The complete link is not stored and will not be shown again.</p>
        </div>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Sending..." : "Send invitation"}
      </Button>
    </form>
  );
}

export function ResetErpCustomerPasswordForm({
  organizationId,
  clientId,
  clientName,
  disabled,
}: {
  organizationId: string;
  clientId: number;
  clientName: string;
  disabled?: boolean;
}) {
  const [state, action, pending] = useActionState(
    resetErpCustomerPassword,
    initialOrganizationActionState,
  );
  return (
    <form action={action} className="rounded-xl border bg-card p-5">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="clientId" value={clientId} />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="font-medium">{clientName}</p>
          <p className="text-xs text-muted-foreground">Client ID {clientId}</p>
        </div>
        <Button type="submit" variant="outline" disabled={pending || disabled}>
          {pending ? "Resetting..." : "Reset to initial password"}
        </Button>
      </div>
      {state.message ? <div className="mt-3"><ActionMessage state={state} /></div> : null}
    </form>
  );
}

function ActionMessage({ state }: { state: { success: boolean; message?: string } }) {
  return (
    <p className={state.success ? "text-sm text-emerald-700" : "text-sm text-destructive"}>
      {state.message}
    </p>
  );
}
