import Link from "next/link";
import { MenuIcon } from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { CompanySwitcher } from "./company-switcher";
import { UserMenu } from "./user-menu";
import { NavSection, type NavItem } from "./nav";
import type { CompanySummary, CurrentUser } from "@/lib/session";
import { roleCan } from "@/lib/permissions";

type Props = {
  user: CurrentUser;
  currentCompany: CompanySummary | null;
  children: React.ReactNode;
};

function buildNav(user: CurrentUser, company: CompanySummary | null) {
  const companyItems: NavItem[] = company
    ? [
        { href: `/app/${company.id}`, label: "Dashboard", icon: "dashboard", exact: true },
        { href: `/app/${company.id}/employees`, label: "Employees", icon: "employees" },
        { href: `/app/${company.id}/attendance`, label: "Attendance", icon: "attendance" },
        { href: `/app/${company.id}/holidays`, label: "Holidays", icon: "holidays" },
        ...(roleCan(user.role, "payroll.compute")
          ? [{ href: `/app/${company.id}/payroll`, label: "Payroll", icon: "payroll" as const }]
          : []),
        ...(roleCan(user.role, "companies.update")
          ? [
              {
                href: `/app/${company.id}/settings`,
                label: "Company settings",
                icon: "settings" as const,
              },
            ]
          : []),
      ]
    : [];
  const adminItems: NavItem[] = roleCan(user.role, "users.manage")
    ? [
        { href: "/app/companies", label: "Companies", icon: "companies" },
        { href: "/app/users", label: "Users", icon: "users" },
      ]
    : [];
  return { companyItems, adminItems };
}

function SidebarBody({ user, currentCompany }: Omit<Props, "children">) {
  const { companyItems, adminItems } = buildNav(user, currentCompany);
  return (
    <div className="flex h-full flex-col gap-5 p-3">
      <Link href="/app" className="flex items-center gap-2 px-1 pt-1">
        <span className="flex size-7 items-center justify-center rounded-md bg-sidebar-primary font-heading text-sm font-bold text-sidebar-primary-foreground">
          U
        </span>
        <span className="text-sm font-semibold text-sidebar-foreground">HRMS Payroll</span>
      </Link>
      <CompanySwitcher companies={user.companies} currentCompanyId={currentCompany?.id ?? null} />
      <nav className="flex flex-1 flex-col gap-5">
        <NavSection title={currentCompany ? currentCompany.code : "Company"} items={companyItems} />
        <NavSection title="Administration" items={adminItems} />
      </nav>
      <div className="border-t border-sidebar-border pt-2">
        <UserMenu user={user} />
      </div>
    </div>
  );
}

export function AppShell({ user, currentCompany, children }: Props) {
  return (
    <div className="flex min-h-svh w-full">
      <aside className="hidden w-64 shrink-0 border-r border-sidebar-border bg-sidebar md:block">
        <div className="sticky top-0 h-svh">
          <SidebarBody user={user} currentCompany={currentCompany} />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 items-center gap-2 border-b bg-card px-3 md:hidden">
          <Sheet>
            <SheetTrigger
              render={<Button variant="ghost" size="icon" aria-label="Open navigation" />}
            >
              <MenuIcon />
            </SheetTrigger>
            <SheetContent
              side="left"
              className="w-72 bg-sidebar p-0 text-sidebar-foreground"
              showCloseButton={false}
            >
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <SidebarBody user={user} currentCompany={currentCompany} />
            </SheetContent>
          </Sheet>
          <span className="text-sm font-semibold">{currentCompany?.code ?? "HRMS Payroll"}</span>
        </header>
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
