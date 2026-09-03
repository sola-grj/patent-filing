import { Suspense } from "react";
import { redirect } from "next/navigation";

import { AppTopNav, AppTopNavFallback } from "@/components/app-top-nav";
import { requesterOrganizationAccessEnabled } from "@/features/organizations/availability";
import { RequestWizardControllerProvider } from "@/features/requester/components/requester-create-request-controller";
import { RequesterNavigationLoadingProvider } from "@/features/requester/components/requester-navigation-loading";
import { requirePortalContext } from "@/lib/auth/portal-context";

const requesterNavLinks = [
  { href: "/requester", label: "Home", exact: true },
  { href: "/requester/requests", label: "Requests" },
  { href: "/requester/drafts", label: "Drafts" },
  ...(requesterOrganizationAccessEnabled
    ? [{ href: "/requester/organization", label: "Organization" }]
    : []),
];

export default function RequesterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<RequesterLayoutFallback />}>
      <RequesterShell>{children}</RequesterShell>
    </Suspense>
  );
}

async function RequesterShell({ children }: { children: React.ReactNode }) {
  const context = await requirePortalContext();
  if (context.passwordSetupRequired) {
    redirect("/auth/update-password?next=/requester");
  }
  return (
    <RequesterNavigationLoadingProvider>
      <RequestWizardControllerProvider>
        <main className="fixed inset-0 grid grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-background">
          <Suspense fallback={<AppTopNavFallback links={requesterNavLinks} notificationHref="/requester/messages" />}>
            <AppTopNav links={requesterNavLinks} notificationHref="/requester/messages" />
          </Suspense>
          <div className="mx-auto flex min-h-0 w-full max-w-[1760px] flex-col overflow-visible px-6 py-7">
            {children}
          </div>
        </main>
      </RequestWizardControllerProvider>
    </RequesterNavigationLoadingProvider>
  );
}

function RequesterLayoutFallback() {
  return (
    <main className="fixed inset-0 grid grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-background">
      <AppTopNavFallback links={requesterNavLinks} notificationHref="/requester/messages" />
      <div className="mx-auto w-full max-w-[1760px] px-6 py-7 text-sm text-muted-foreground">
        Loading workspace...
      </div>
    </main>
  );
}
