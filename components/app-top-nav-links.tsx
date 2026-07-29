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
    <div className="hidden h-full items-center gap-8 md:flex">
      {links.map((link) => {
        const active = link.exact
          ? pathname === link.href
          : pathname === link.href || pathname.startsWith(`${link.href}/`);

        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "relative flex h-full items-center text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
              active && "text-emerald-950",
            )}
          >
            {link.label}
            {active ? (
              <span className="absolute inset-x-0 -bottom-[1px] h-0.5 bg-emerald-900" />
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}
