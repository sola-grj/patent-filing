import Image from "next/image";
import Link from "next/link";

import { getOptionalAuthenticatedUser } from "@/lib/auth/user-routing";
import { UserAccountMenu } from "@/components/user-account-menu";
import {
  AppTopNavLinks,
  type AppTopNavLink,
} from "@/components/app-top-nav-links";

export async function AppTopNav({
  links = [],
}: {
  links?: AppTopNavLink[];
}) {
  const user = await getOptionalAuthenticatedUser();
  const { data: profile } = user
    ? await user.supabase
        .from("profiles")
        .select("display_name")
        .eq("user_id", user.userId)
        .maybeSingle()
    : { data: null };
  const accountLabel = profile?.display_name || user?.email || null;

  return (
    <div className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <nav className="flex h-[68px] w-full items-center justify-between gap-6 px-6 text-sm">
        <div className="flex h-full min-w-0 items-center gap-16">
          <Link
            href="/"
            className="flex items-center gap-3 text-xl font-semibold tracking-tight text-foreground"
          >
            <Image
              src="/logo.svg"
              alt=""
              width={25}
              height={24}
              className="size-8"
              priority
            />
            Pat
          </Link>
          {links.length ? (
            <AppTopNavLinks links={links} />
          ) : null}
        </div>
        <div className="min-w-0 shrink-0">
          <UserAccountMenu email={accountLabel} />
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
      <nav className="flex h-[68px] w-full items-center justify-between gap-6 px-6 text-sm">
        <div className="flex h-full min-w-0 items-center gap-16">
          <Link
            href="/"
            className="flex items-center gap-3 text-xl font-semibold tracking-tight text-foreground"
          >
            <Image
              src="/logo.svg"
              alt=""
              width={25}
              height={24}
              className="size-8"
              priority
            />
            Pat
          </Link>
          {links.length ? (
            <div className="hidden items-center gap-2 md:flex">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="flex items-center rounded-full px-4 py-2 text-sm font-medium text-muted-foreground"
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
