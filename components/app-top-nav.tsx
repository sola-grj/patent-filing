import Image from "next/image";
import Link from "next/link";
import { Bell } from "lucide-react";

import { getOptionalPortalContext } from "@/lib/auth/portal-context";
import { UserAccountMenu } from "@/components/user-account-menu";
import {
  AppTopNavLinks,
  type AppTopNavLink,
} from "@/components/app-top-nav-links";

export async function AppTopNav({
  links = [],
  notificationHref,
}: {
  links?: AppTopNavLink[];
  notificationHref?: string;
}) {
  const context = await getOptionalPortalContext();
  const accountLabel = context?.displayName || context?.email || null;
  const unreadCount = notificationHref ? context?.unreadCount ?? 0 : 0;

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
        <div className="flex min-w-0 shrink-0 items-center gap-7">
          {notificationHref ? (
            <NotificationBell href={notificationHref} unreadCount={unreadCount} />
          ) : null}
          <UserAccountMenu email={accountLabel} />
        </div>
      </nav>
    </div>
  );
}

export function AppTopNavFallback({
  links = [],
  notificationHref,
}: {
  links?: AppTopNavLink[];
  notificationHref?: string;
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
        {notificationHref ? (
          <NotificationBell href={notificationHref} unreadCount={0} />
        ) : null}
      </nav>
    </div>
  );
}

function NotificationBell({ href, unreadCount }: { href: string; unreadCount: number }) {
  return (
    <Link
      href={href}
      aria-label={unreadCount ? `${unreadCount} unread messages` : "Messages"}
      className="relative flex size-10 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted"
    >
      <Bell className="size-6" strokeWidth={1.8} />
      {unreadCount ? (
        <span className="absolute right-0 top-0 flex min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-semibold leading-5 text-white ring-2 ring-background">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      ) : null}
    </Link>
  );
}
