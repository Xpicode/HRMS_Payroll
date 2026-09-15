import Link from "next/link";
import { MenuIcon } from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { CompanySwitcher } from "./company-switcher";
import { UserMenu } from "./user-menu";
import { NavSection, type NavItem } from "./nav";
import { PageTransition } from "./page-transition";
import { MobileTabBar } from "./mobile-tab-bar";
import { AmbientBackground } from "./ambient-background";
import type { CompanySummary, CurrentUser } from "@/lib/session";
import { roleCan } from "@/lib/permissions";
import { cn } from "@/lib/utils";

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
        { href: `/app/${company.id}/leave`, label: "Leave", icon: "leave" },
        { href: `/app/${company.id}/holidays`, label: "Holidays", icon: "holidays" },
        ...(roleCan(user.role, "payroll.compute")
          ? [{ href: `/app/${company.id}/payroll`, label: "Payroll", icon: "payroll" as const }]
          : []),
        ...(roleCan(user.role, "reports.view")
          ? [{ href: `/app/${company.id}/reports`, label: "Reports", icon: "reports" as const }]
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
        { href: "/app/audit", label: "Audit log", icon: "audit" },
      ]
    : [];
  return { companyItems, adminItems };
}

/**
 * `rail`: on tablets (md up to lg) the desktop sidebar shrinks to an icon rail with the labels
 * hidden; the same body in the phone sheet is always full width.
 */
function SidebarBody({ user, currentCompany, rail }: Omit<Props, "children"> & { rail?: boolean }) {
  const { companyItems, adminItems } = buildNav(user, currentCompany);
  return (
    <div
      className={cn(
        "flex h-full flex-col gap-5 p-3",
        rail && "md:max-lg:items-stretch md:max-lg:p-2",
      )}
    >
      <Link
        href="/app"
        className={cn(
          "group flex items-center gap-2 px-1 pt-1",
          rail && "md:max-lg:justify-center md:max-lg:px-0",
        )}
      >
        <span className="flex size-7 items-center justify-center rounded-md bg-sidebar-primary font-heading text-sm font-bold text-sidebar-primary-foreground shadow-[0_0_16px_-4px_var(--sidebar-primary),inset_0_1px_0_0_rgba(255,255,255,0.25)] transition-[transform,box-shadow] duration-300 ease-out-expo group-hover:-rotate-6 group-hover:shadow-[0_0_28px_-4px_var(--sidebar-primary),inset_0_1px_0_0_rgba(255,255,255,0.25)]">
          U
        </span>
        <span
          className={cn(
            "text-sm font-semibold text-sidebar-foreground",
            rail && "md:max-lg:sr-only",
          )}
        >
          HRMS Payroll
        </span>
      </Link>
      <CompanySwitcher
        companies={user.companies}
        currentCompanyId={currentCompany?.id ?? null}
        rail={rail}
      />
      <nav className="flex flex-1 flex-col gap-5">
        <NavSection
          title={currentCompany ? currentCompany.code : "Company"}
          items={companyItems}
          rail={rail}
        />
        <NavSection title="Administration" items={adminItems} rail={rail} />
      </nav>
      <div className="border-t border-sidebar-border pt-2">
        <UserMenu user={user} rail={rail} />
      </div>
    </div>
  );
}

export function AppShell({ user, currentCompany, children }: Props) {
  return (
    <div className="flex min-h-svh w-full">
      <AmbientBackground />
      <aside className="hidden w-[4.25rem] shrink-0 border-r border-sidebar-border bg-sidebar/80 bg-[radial-gradient(40rem_24rem_at_0%_0%,oklch(0.36_0.09_262/0.55),transparent_70%)] backdrop-blur-xl transition-[width] duration-300 md:block lg:w-64 dark:bg-[radial-gradient(32rem_20rem_at_0%_0%,rgba(94,106,210,0.16),transparent_70%)]">
        <div className="sticky top-0 h-svh">
          <SidebarBody user={user} currentCompany={currentCompany} rail />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-12 items-center gap-2 border-b bg-background/80 px-3 backdrop-blur-xl md:hidden">
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
        <main className="flex-1 px-4 pt-5 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:px-6 md:py-6 lg:px-8">
          <div className="mx-auto w-full max-w-6xl">
            <PageTransition>{children}</PageTransition>
          </div>
        </main>
        {currentCompany ? (
          <MobileTabBar user={user} company={currentCompany}>
            <SidebarBody user={user} currentCompany={currentCompany} />
          </MobileTabBar>
        ) : null}
      </div>
    </div>
  );
}
