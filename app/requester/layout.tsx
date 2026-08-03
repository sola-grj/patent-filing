import { Suspense } from "react";

import { AppTopNav, AppTopNavFallback } from "@/components/app-top-nav";
import { RequestWizardControllerProvider } from "@/features/requester/components/requester-create-request-controller";

const requesterNavLinks = [
  { href: "/requester", label: "Home", exact: true },
  { href: "/requester/requests", label: "Requests" },
  { href: "/requester/drafts", label: "Drafts" },
  { href: "/requester/orders", label: "Orders" },
];

export default function RequesterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RequestWizardControllerProvider>
      <main className="fixed inset-0 grid grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-background">
        <Suspense fallback={<AppTopNavFallback links={requesterNavLinks} />}>
          <AppTopNav links={requesterNavLinks} />
        </Suspense>
        <div className="mx-auto flex min-h-0 w-full max-w-[1760px] flex-col overflow-visible px-6 py-7">
          {children}
        </div>
      </main>
    </RequestWizardControllerProvider>
  );
}
