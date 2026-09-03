import { Suspense } from "react";
import { redirect } from "next/navigation";

import { AppTopNav, AppTopNavFallback } from "@/components/app-top-nav";
import { requirePortalContext } from "@/lib/auth/portal-context";
import { PmRealtimeNotifications } from "@/features/pm/components/pm-realtime-notifications";

const pmNavLinks = [
  { href: "/pm", label: "Home", exact: true },
  { href: "/pm/orders", label: "Orders" },
  { href: "/pm/messages", label: "Messages" },
  { href: "/pm/customers", label: "Customers" },
  { href: "/pm/patent-search", label: "Patent Search" },
];

export default function PmLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<PmLayoutFallback />}>
      <PmShell>{children}</PmShell>
    </Suspense>
  );
}

async function PmShell({ children }: { children: React.ReactNode }) {
  const context = await requirePortalContext();
  if (context.passwordSetupRequired) {
    redirect("/auth/update-password?next=/pm");
  }
  return (
    <main className="fixed inset-0 grid grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-background">
      <Suspense fallback={<AppTopNavFallback links={pmNavLinks} notificationHref="/pm/messages" />}>
        <AppTopNav links={pmNavLinks} notificationHref="/pm/messages" />
      </Suspense>
      <PmRealtimeNotifications userId={context.userId} />
      <div className="mx-auto flex min-h-0 w-full max-w-[1760px] flex-col overflow-visible px-6 py-7">
        {children}
      </div>
    </main>
  );
}

function PmLayoutFallback() {
  return (
    <main className="fixed inset-0 grid grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-background">
      <AppTopNavFallback links={pmNavLinks} notificationHref="/pm/messages" />
      <div className="mx-auto w-full max-w-[1760px] px-6 py-7 text-sm text-muted-foreground">
        Loading workspace...
      </div>
    </main>
  );
}
