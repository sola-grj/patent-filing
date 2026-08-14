import Link from "next/link";
import { Suspense } from "react";

import { Badge } from "@/components/ui/badge";
import { CreateCustomerOrganizationForm } from "@/features/organizations/components/organization-admin-forms";
import { getSupplierCustomers } from "@/features/organizations/queries";
import { PmAccessDenied } from "@/features/pm/components/pm-access-denied";
import { PmHeader } from "@/features/pm/components/pm-header";

export default function CustomersPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading customers...</p>}>
      <CustomersContent />
    </Suspense>
  );
}

async function CustomersContent() {
  const result = await getSupplierCustomers();
  if (result.denied) return <PmAccessDenied />;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="grid gap-6 pb-8">
        <PmHeader
          title="Customers"
          description="Customer organizations actively associated with this supplier."
        />
        <div className={result.isAdmin ? "grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]" : "grid gap-6"}>
          <section className="rounded-xl border bg-card p-5">
            <div className="divide-y">
              {result.customers.map((customer) => (
                <Link key={customer.id} href={`/pm/customers/${customer.id}`} className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0 hover:text-primary">
                  <div>
                    <p className="font-medium">{customer.name}</p>
                    <p className="text-xs text-muted-foreground">Linked {new Date(customer.startedAt).toLocaleDateString("en-US")}</p>
                  </div>
                  <Badge variant="outline">Request sharing {customer.requestSharingEnabled ? "on" : "off"}</Badge>
                </Link>
              ))}
              {!result.customers.length ? <p className="py-5 text-sm text-muted-foreground">No customer organizations are linked yet.</p> : null}
            </div>
          </section>
          {result.isAdmin ? <CreateCustomerOrganizationForm /> : null}
        </div>
      </div>
    </div>
  );
}
