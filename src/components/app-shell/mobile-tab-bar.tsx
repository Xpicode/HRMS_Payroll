"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalculatorIcon,
  ClockIcon,
  ContactIcon,
  LayoutDashboardIcon,
  MenuIcon,
  PlaneIcon,
  type LucideIcon,
} from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { roleCan } from "@/lib/permissions";
import type { CompanySummary, CurrentUser } from "@/lib/session";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string; icon: LucideIcon; exact?: boolean };

/**
 * Phone navigation: the four screens people open most, thumb-reachable at the bottom, plus
 * "Menu" for everything else (the same sidebar, as a sheet). Hidden from `md` up, where the
 * sidebar is visible.
 */
export function MobileTabBar({
  user,
  company,
  children,
}: {
  user: CurrentUser;
  company: CompanySummary;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const base = `/app/${company.id}`;
  const items: Item[] = [
    { href: base, label: "Home", icon: LayoutDashboardIcon, exact: true },
    { href: `${base}/employees`, label: "Employees", icon: ContactIcon },
    { href: `${base}/attendance`, label: "Attendance", icon: ClockIcon },
    roleCan(user.role, "payroll.view")
      ? { href: `${base}/payroll`, label: "Payroll", icon: CalculatorIcon }
      : { href: `${base}/leave`, label: "Leave", icon: PlaneIcon },
  ];
  const isActive = (item: Item) =>
    item.exact ? pathname === item.href : pathname.startsWith(item.href);
  const itemClass =
    "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 text-[11px] font-medium text-muted-foreground transition-colors active:bg-muted";

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
      aria-label="Quick navigation"
    >
      <ul className="flex items-stretch px-2 pt-1">
        {items.map((item) => {
          const active = isActive(item);
          return (
            <li key={item.href} className="flex min-w-0 flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(itemClass, active && "text-primary")}
              >
                <span
                  className={cn(
                    "flex h-7 w-12 items-center justify-center rounded-full transition-colors",
                    active && "bg-primary/10",
                  )}
                >
                  <item.icon className="size-5" />
                </span>
                <span className="truncate">{item.label}</span>
              </Link>
            </li>
          );
        })}
        <li className="flex min-w-0 flex-1">
          <Sheet>
            <SheetTrigger className={itemClass} aria-label="Open full menu">
              <span className="flex h-7 w-12 items-center justify-center rounded-full">
                <MenuIcon className="size-5" />
              </span>
              <span>Menu</span>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="w-72 bg-sidebar p-0 text-sidebar-foreground"
              showCloseButton={false}
            >
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              {children}
            </SheetContent>
          </Sheet>
        </li>
      </ul>
    </nav>
  );
}
