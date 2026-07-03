import { Suspense } from "react";

import { AppTopNav, AppTopNavFallback } from "@/components/app-top-nav";
import { RequestWizardControllerProvider } from "@/features/requester/components/requester-create-request-controller";

export default function RequesterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RequestWizardControllerProvider>
      <main className="min-h-dvh bg-background">
        <Suspense fallback={<AppTopNavFallback />}>
          <AppTopNav />
        </Suspense>
        <div className="mx-auto flex min-h-[calc(100dvh-4.5rem)] w-full max-w-7xl flex-col px-6 py-8">
          {children}
        </div>
      </main>
    </RequestWizardControllerProvider>
  );
}
