import { Suspense } from "react";

import { AppTopNav, AppTopNavFallback } from "@/components/app-top-nav";

const pmNavLinks = [
  { href: "/pm", label: "Home", exact: true },
  { href: "/pm/orders", label: "Orders" },
  { href: "/pm/patent-search", label: "Patent Search" },
];

export default function PmLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="fixed inset-0 grid grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-background">
      <Suspense fallback={<AppTopNavFallback links={pmNavLinks} />}>
        <AppTopNav links={pmNavLinks} />
      </Suspense>
      <div className="mx-auto flex min-h-0 w-full max-w-[1760px] flex-col overflow-visible px-6 py-7">
        {children}
      </div>
    </main>
  );
}
