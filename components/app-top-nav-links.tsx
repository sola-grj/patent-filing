"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

export type AppTopNavLink = {
  href: string;
  label: string;
  exact?: boolean;
};

export function AppTopNavLinks({ links }: { links: AppTopNavLink[] }) {
  const pathname = usePathname();

  return (
    <div className="hidden items-center gap-2 md:flex">
      {links.map((link) => {
        const active = link.exact
          ? pathname === link.href
          : pathname === link.href || pathname.startsWith(`${link.href}/`);

        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center rounded-full px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
              active && "bg-foreground text-background shadow-sm hover:bg-foreground hover:text-background",
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </div>
  );
}
