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

export function NavSection({ title, items }: { title: string; items: NavItem[] }) {
  const pathname = usePathname();
  if (items.length === 0) return null;
  return (
    <div>
      <p className="px-2 pb-1 text-[11px] font-medium tracking-wider text-sidebar-muted uppercase">
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
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-sidebar-foreground/85 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground",
                  active &&
                    "bg-sidebar-accent font-medium text-sidebar-foreground shadow-[inset_2px_0_0_0_var(--sidebar-primary)]",
                )}
              >
                <Icon className="size-4 shrink-0 opacity-80" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
