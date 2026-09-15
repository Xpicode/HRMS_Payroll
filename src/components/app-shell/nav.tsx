"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2Icon,
  CalculatorIcon,
  CalendarDaysIcon,
  ClockIcon,
  ContactIcon,
  FileSpreadsheetIcon,
  HistoryIcon,
  LayoutDashboardIcon,
  PlaneIcon,
  Settings2Icon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type NavItem = { href: string; label: string; icon: keyof typeof ICONS; exact?: boolean };

const ICONS = {
  dashboard: LayoutDashboardIcon,
  holidays: CalendarDaysIcon,
  employees: ContactIcon,
  attendance: ClockIcon,
  leave: PlaneIcon,
  payroll: CalculatorIcon,
  reports: FileSpreadsheetIcon,
  settings: Settings2Icon,
  companies: Building2Icon,
  users: UsersIcon,
  audit: HistoryIcon,
} satisfies Record<string, LucideIcon>;

export function NavSection({
  title,
  items,
  rail,
}: {
  title: string;
  items: NavItem[];
  /** Tablet icon rail: labels become screen-reader only, icons centre (see AppShell). */
  rail?: boolean;
}) {
  const pathname = usePathname();
  if (items.length === 0) return null;
  return (
    <div>
      <p
        className={cn(
          "px-2 pb-1 text-[11px] font-medium tracking-wider text-sidebar-muted uppercase",
          rail && "md:max-lg:sr-only",
        )}
      >
        {title}
      </p>
      <ul className="space-y-0.5">
        {items.map((item) => {
          const Icon = ICONS[item.icon];
          const active = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                title={rail ? item.label : undefined}
                className={cn(
                  "group/nav relative flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-sidebar-foreground/85 transition-[background-color,color,transform] duration-200 hover:translate-x-0.5 hover:bg-sidebar-accent hover:text-sidebar-foreground active:translate-x-0",
                  rail &&
                    "md:max-lg:justify-center md:max-lg:px-0 md:max-lg:py-2 md:max-lg:hover:translate-x-0",
                  // the gold bar grows in from the middle when a section becomes current
                  "before:absolute before:top-1/2 before:left-0 before:h-0 before:w-0.5 before:-translate-y-1/2 before:rounded-full before:bg-sidebar-primary before:transition-[height] before:duration-300 before:ease-out",
                  active && "bg-sidebar-accent font-medium text-sidebar-foreground before:h-4",
                )}
              >
                <Icon
                  className={cn(
                    "size-4 shrink-0 opacity-80 transition-transform duration-200 group-hover/nav:scale-110",
                    rail && "md:max-lg:size-5",
                    active && "text-sidebar-primary opacity-100",
                  )}
                />
                <span className={cn(rail && "md:max-lg:sr-only")}>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
