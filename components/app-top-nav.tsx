import Link from "next/link";

import { getOptionalAuthenticatedUser } from "@/lib/auth/user-routing";
import { UserAccountMenu } from "@/components/user-account-menu";

type AppTopNavLink = {
  href: string;
  label: string;
};

export async function AppTopNav({
  links = [],
}: {
  links?: AppTopNavLink[];
}) {
  const user = await getOptionalAuthenticatedUser();

  return (
    <div className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <nav className="flex w-full items-center justify-between gap-6 px-6 py-4 text-sm">
        <div className="flex min-w-0 items-center gap-8">
          <Link href="/" className="font-semibold tracking-tight">
            Patentia
          </Link>
          {links.length ? (
            <div className="flex items-center gap-5">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
        <div className="min-w-0 shrink-0">
          <UserAccountMenu email={user?.email ?? null} />
        </div>
      </nav>
    </div>
  );
}

export function AppTopNavFallback({
  links = [],
}: {
  links?: AppTopNavLink[];
}) {
  return (
    <div className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <nav className="flex w-full items-center justify-between gap-6 px-6 py-4 text-sm">
        <div className="flex min-w-0 items-center gap-8">
          <Link href="/" className="font-semibold tracking-tight">
            Patentia
          </Link>
          {links.length ? (
            <div className="flex items-center gap-5">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      </nav>
    </div>
  );
}
