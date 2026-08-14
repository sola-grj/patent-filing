import { Badge } from "@/components/ui/badge";
import { Suspense } from "react";
import { InviteOrganizationMemberForm } from "@/features/organizations/components/organization-admin-forms";
import { OrganizationMembers } from "@/features/organizations/components/organization-members";
import { getRequesterOrganizationManagement } from "@/features/organizations/queries";

export default function RequesterOrganizationPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading organization...</p>}>
      <RequesterOrganizationContent />
    </Suspense>
  );
}

async function RequesterOrganizationContent() {
  const result = await getRequesterOrganizationManagement();

  if (result.denied || !result.organization) {
    return (
      <div className="rounded-xl border bg-card p-6">
        <h1 className="text-xl font-semibold">Organization assignment pending</h1>
        <p className="mt-2 text-sm text-muted-foreground">Contact your ECI administrator to receive an organization invitation.</p>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="grid gap-6 pb-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{result.organization.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">Organization members and pending invitations.</p>
          </div>
          <Badge variant="outline">Request sharing {result.organization.requestSharingEnabled ? "on" : "off"}</Badge>
        </div>
        <div className={result.isAdmin ? "grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]" : "grid gap-6"}>
          <OrganizationMembers members={result.organization.members} invitations={result.organization.invitations} />
          {result.isAdmin ? <InviteOrganizationMemberForm organizationId={result.organization.id} organizationName={result.organization.name} /> : null}
        </div>
      </div>
    </div>
  );
}
