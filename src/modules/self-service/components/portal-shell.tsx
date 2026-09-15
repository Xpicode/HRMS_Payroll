import Link from "next/link";
import { AmbientBackground } from "@/components/app-shell/ambient-background";
import { PageTransition } from "@/components/app-shell/page-transition";
import { UserMenu } from "@/components/app-shell/user-menu";
import { CompanyMark } from "@/components/company-mark";
import type { CompanySummary, CurrentUser } from "@/lib/session";
import { PortalNav, PortalTabBar } from "./portal-nav";

/**
 * The employee portal frame: one header (company, sections, account) and a narrow column of
 * content. No sidebar and no company switcher — an employee belongs to exactly one company.
 */
export function PortalShell({
  user,
  company,
  children,
}: {
  user: CurrentUser;
  company: CompanySummary | null;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-svh flex-col">
      <AmbientBackground />
      <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 w-full max-w-4xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link href="/me" className="flex min-w-0 items-center gap-2.5">
            {company ? (
              <CompanyMark company={company} size="sm" />
            ) : (
              <span className="flex size-7 items-center justify-center rounded-md bg-primary font-heading text-sm font-bold text-primary-foreground">
                U
              </span>
            )}
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">
                {company ? (company.tradeName ?? company.legalName) : "HRMS Payroll"}
              </span>
              <span className="eyebrow block text-[10px]">Employee portal</span>
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <PortalNav />
            <UserMenu user={user} compact passwordHref="/me/password" />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 pt-5 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:px-6 md:py-8">
        <PageTransition>{children}</PageTransition>
      </main>
      <PortalTabBar />
    </div>
  );
}
