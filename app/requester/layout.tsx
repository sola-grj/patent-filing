import Link from "next/link";
import { Suspense } from "react";

import { RequesterCreateRequestButton } from "@/features/requester/components/requester-create-request-button";
import { RequestWizardControllerProvider } from "@/features/requester/components/requester-create-request-controller";
import { getRequesterOrganization } from "@/features/requester/server-utils";

export default function RequesterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RequestWizardControllerProvider>
      <main className="grid h-dvh grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-background">
        <div className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 text-sm">
            <Link href="/requester" className="font-semibold tracking-tight">
              Patentia
            </Link>
            <Suspense fallback={null}>
              <RequesterNavAction />
            </Suspense>
          </nav>
        </div>
        <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-col overflow-y-auto px-6 py-8">
          {children}
        </div>
      </main>
    </RequestWizardControllerProvider>
  );
}

async function RequesterNavAction() {
  const { organization } = await getRequesterOrganization();

  if (!organization) {
    return null;
  }

  return <RequesterCreateRequestButton />;
}
