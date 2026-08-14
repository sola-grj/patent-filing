import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Badge } from "@/components/ui/badge";
import { InviteOrganizationMemberForm } from "@/features/organizations/components/organization-admin-forms";
import { OrganizationMembers } from "@/features/organizations/components/organization-members";
import { getSupplierCustomer } from "@/features/organizations/queries";
import { PmAccessDenied } from "@/features/pm/components/pm-access-denied";
import { PmHeader } from "@/features/pm/components/pm-header";

export default function CustomerPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading customer...</p>}>
      <CustomerContent params={params} />
    </Suspense>
  );
}

async function CustomerContent({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  const result = await getSupplierCustomer(organizationId);
  if (result.denied) return <PmAccessDenied />;
  if (!result.customer) notFound();

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="grid gap-6 pb-8">
        <div className="flex items-start justify-between gap-4">
          <PmHeader title={result.customer.name} description="Customer membership and invitation administration." />
          <Badge variant="outline">Request sharing {result.customer.requestSharingEnabled ? "on" : "off"}</Badge>
        </div>
        <p className="rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          Request sharing cannot be changed here. It is controlled only through the audited service-role administration command.
        </p>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
          <OrganizationMembers members={result.customer.members} invitations={result.customer.invitations} />
          <InviteOrganizationMemberForm organizationId={result.customer.id} organizationName={result.customer.name} />
        </div>
      </div>
    </div>
  );
}
