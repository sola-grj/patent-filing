"use client";

import { useEffect, useState } from "react";
import { ChevronDown, LogOut, Palette, SunMoon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";

import { useColorTheme } from "@/components/color-theme-provider";
import { createClient } from "@/lib/supabase/client";
import {
  colorThemes,
  defaultColorTheme,
  isColorTheme,
} from "@/lib/color-theme";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function UserAccountMenu({ email }: { email: string | null }) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { colorTheme, setColorTheme } = useColorTheme();
  const [mounted, setMounted] = useState(false);
  const initials = getAccountInitials(email);

  useEffect(() => {
    setMounted(true);
  }, []);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/auth/login");
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-auto max-w-[260px] justify-end gap-2 px-0 py-0 text-sm font-normal hover:bg-transparent"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-semibold text-brand-foreground">
            {initials}
          </span>
          <span className="hidden truncate text-right text-foreground sm:block">
            {email ?? "Signed in"}
          </span>
          <ChevronDown className="size-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="truncate">{email ?? "Signed in"}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="px-2 py-1.5">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            <SunMoon className="size-3.5" />
            Appearance
          </p>
        </div>
        <DropdownMenuRadioGroup
          value={mounted ? theme : "system"}
          onValueChange={setTheme}
        >
          <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">System</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <div className="px-2 py-1.5">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            <Palette className="size-3.5" />
            Color theme
          </p>
        </div>
        <DropdownMenuRadioGroup
          value={mounted ? colorTheme : defaultColorTheme}
          onValueChange={(value) => {
            if (isColorTheme(value)) {
              setColorTheme(value);
            }
          }}
        >
          {colorThemes.map((colorOption) => (
            <DropdownMenuRadioItem
              key={colorOption.value}
              value={colorOption.value}
              className="gap-2"
            >
              <span
                className="size-3.5 rounded-full border border-black/10 shadow-sm"
                style={{ backgroundColor: colorOption.swatch }}
              />
              {colorOption.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void handleLogout()}>
          <LogOut className="size-4" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function getAccountInitials(email: string | null) {
  const accountName = email?.split("@")[0]?.trim();
  if (!accountName) return "U";

  return accountName
    .split(/[._\-\s]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}
