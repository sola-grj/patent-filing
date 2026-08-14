import { redirect } from "next/navigation";
import { Suspense } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { acceptOrganizationInvitation } from "@/features/organizations/actions";
import { getOptionalAuthenticatedUser } from "@/lib/auth/user-routing";

export default function OrganizationInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; new?: string; error?: string }>;
}) {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-muted-foreground">Loading invitation...</p>}>
      <OrganizationInviteContent searchParams={searchParams} />
    </Suspense>
  );
}

async function OrganizationInviteContent({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; new?: string; error?: string }>;
}) {
  const { token, new: newAccount, error } = await searchParams;
  if (!token) redirect("/auth/error?error=Missing organization invitation token");

  const user = await getOptionalAuthenticatedUser();
  if (!user) {
    const next = `/auth/organization-invite?token=${encodeURIComponent(token)}${newAccount === "1" ? "&new=1" : ""}`;
    redirect(`/auth/login?next=${encodeURIComponent(next)}`);
  }

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Accept organization invitation</CardTitle>
          <CardDescription>
            Signed in as {user.email}. The invitation will only succeed if it was issued to this address.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error ? <p className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p> : null}
          <form action={acceptOrganizationInvitation}>
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="newAccount" value={newAccount === "1" ? "true" : "false"} />
            <Button className="w-full" type="submit">Accept invitation</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
