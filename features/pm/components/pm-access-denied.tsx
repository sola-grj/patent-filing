import Link from "next/link";

import { Button } from "@/components/ui/button";

export function PmAccessDenied() {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-12rem)] max-w-xl flex-col items-center justify-center text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        Patentia PM
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">
        PM access required
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Your account is signed in, but it is not assigned to a PM, ops, or admin
        role.
      </p>
      <Button asChild className="mt-6" variant="outline">
        <Link href="/requester">Return to requester portal</Link>
      </Button>
    </div>
  );
}
