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

type Props = { user: { name: string; email: string; role: Role }; rail?: boolean };

export function UserMenu({ user, rail }: Props) {
  const initials = user.name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex w-full items-center gap-2.5 rounded-lg p-2 text-left outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring",
          rail && "md:max-lg:justify-center md:max-lg:p-1.5",
        )}
        aria-label="Account menu"
        title={rail ? user.name : undefined}
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-xs font-semibold text-sidebar-foreground">
          {initials || "?"}
        </span>
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
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-(--anchor-width) min-w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="truncate">{user.email}</DropdownMenuLabel>
          <DropdownMenuItem render={<Link href="/app/account/password" />}>
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
