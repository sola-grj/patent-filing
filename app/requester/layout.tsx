import Link from "next/link";
import { Suspense } from "react";

import { Button } from "@/components/ui/button";
import { getRequesterOrganization } from "@/features/requester/server-utils";

export default function RequesterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-background">
      <div className="border-b">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 text-sm">
          <Link href="/requester" className="font-semibold tracking-tight">
            Patentia
          </Link>
          <Suspense fallback={null}>
            <RequesterNavAction />
          </Suspense>
        </nav>
      </div>
      <div className="mx-auto max-w-7xl px-6 py-8">{children}</div>
    </main>
  );
}

async function RequesterNavAction() {
  const { organization } = await getRequesterOrganization();

  if (!organization) {
    return null;
  }

  return (
    <Button asChild size="sm">
      <Link href="/requester/requests/new">Create Request</Link>
    </Button>
  );
}
