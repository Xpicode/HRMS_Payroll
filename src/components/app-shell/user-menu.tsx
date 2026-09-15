"use client";

import Link from "next/link";
import { KeyRoundIcon, LogOutIcon, MoreVerticalIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { logoutAction } from "@/modules/auth/actions";
import { ThemeMenuItems } from "@/components/theme-toggle";
import { ROLE_LABELS } from "@/lib/permissions";
import type { Role } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

type Props = {
  user: { name: string; email: string; role: Role };
  rail?: boolean;
  /** Header variant (employee portal): avatar only, menu opens downwards. */
  compact?: boolean;
  /** Where "Change password" goes; the employee portal has its own page. */
  passwordHref?: string;
};

export function UserMenu({ user, rail, compact, passwordHref = "/app/account/password" }: Props) {
  const initials = user.name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          compact
            ? "flex size-9 items-center justify-center rounded-full outline-none transition-[box-shadow,transform] duration-200 hover:scale-105 focus-visible:ring-2 focus-visible:ring-ring/60"
            : "flex w-full items-center gap-2.5 rounded-lg p-2 text-left outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring",
          rail && "md:max-lg:justify-center md:max-lg:p-1.5",
        )}
        aria-label="Account menu"
        title={rail || compact ? user.name : undefined}
      >
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
            compact
              ? "bg-primary/15 text-primary ring-1 ring-primary/30"
              : "bg-sidebar-accent text-sidebar-foreground",
          )}
        >
          {initials || "?"}
        </span>
        {compact ? null : (
          <>
            <span className={cn("min-w-0 flex-1", rail && "md:max-lg:sr-only")}>
              <span className="block truncate text-sm font-medium text-sidebar-foreground">
                {user.name}
              </span>
              <span className="block truncate text-[11px] text-sidebar-muted">
                {ROLE_LABELS[user.role]}
              </span>
            </span>
            <MoreVerticalIcon
              className={cn("size-4 shrink-0 text-sidebar-muted", rail && "md:max-lg:hidden")}
            />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={compact ? "bottom" : "top"}
        align={compact ? "end" : "start"}
        className={cn("min-w-56", !compact && "w-(--anchor-width)")}
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="truncate">
            {compact ? user.name : user.email}
          </DropdownMenuLabel>
          {compact ? (
            <DropdownMenuLabel className="truncate pt-0 text-xs font-normal text-muted-foreground">
              {user.email}
            </DropdownMenuLabel>
          ) : null}
          <DropdownMenuItem render={<Link href={passwordHref} />}>
            <KeyRoundIcon />
            Change password
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Appearance</DropdownMenuLabel>
          <ThemeMenuItems />
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <form action={logoutAction}>
          <DropdownMenuItem
            render={<button type="submit" className="w-full" />}
            nativeButton
            variant="destructive"
          >
            <LogOutIcon />
            Sign out
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
