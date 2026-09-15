"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ClockIcon,
  HomeIcon,
  PlaneIcon,
  ReceiptTextIcon,
  UserRoundIcon,
  type LucideIcon,
} from "lucide-react";
import { PORTAL_SECTIONS } from "../schema";
import { cn } from "@/lib/utils";

const ICONS: Record<(typeof PORTAL_SECTIONS)[number]["href"], LucideIcon> = {
  "/me": HomeIcon,
  "/me/payslips": ReceiptTextIcon,
  "/me/attendance": ClockIcon,
  "/me/leave": PlaneIcon,
  "/me/profile": UserRoundIcon,
};

function useActive() {
  const pathname = usePathname();
  return (item: { href: string; exact?: boolean }) =>
    item.exact
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(item.href + "/");
}

/** Desktop: a row of pills in the header. */
export function PortalNav() {
  const isActive = useActive();
  return (
    <nav aria-label="Portal sections" className="hidden items-center gap-1 md:flex">
      {PORTAL_SECTIONS.map((item) => {
        const Icon = ICONS[item.href];
        const active = isActive(item);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-muted-foreground transition-[background-color,color,box-shadow] duration-200 ease-out-expo hover:bg-muted hover:text-foreground",
              active && "bg-primary/12 text-primary shadow-[0_0_14px_-4px_var(--primary)]",
            )}
          >
            <Icon className="size-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Phone: five thumb-reachable tabs at the bottom. */
export function PortalTabBar() {
  const isActive = useActive();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
      aria-label="Portal sections"
    >
      <ul className="flex items-stretch px-2 pt-1">
        {PORTAL_SECTIONS.map((item) => {
          const Icon = ICONS[item.href];
          const active = isActive(item);
          return (
            <li key={item.href} className="flex min-w-0 flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 text-[11px] font-medium text-muted-foreground transition-colors active:bg-muted",
                  active && "text-primary",
                )}
              >
                <span
                  className={cn(
                    "flex h-7 w-12 items-center justify-center rounded-full transition-[background-color,box-shadow] duration-200",
                    active && "bg-primary/15 shadow-[0_0_16px_-4px_var(--primary)]",
                  )}
                >
                  <Icon className="size-5" />
                </span>
                <span className="truncate">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
