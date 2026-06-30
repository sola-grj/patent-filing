import { Suspense } from "react";

import { AppTopNav, AppTopNavFallback } from "@/components/app-top-nav";

export default function PmLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="grid h-dvh grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-background">
      <Suspense fallback={<AppTopNavFallback />}>
        <AppTopNav />
      </Suspense>
      <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-col overflow-hidden px-6 py-8">
        {children}
      </div>
    </main>
  );
}
