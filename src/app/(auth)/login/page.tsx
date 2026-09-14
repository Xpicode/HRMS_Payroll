import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { safeRelativePath } from "@/lib/request";
import { LoginForm } from "@/modules/auth/components/login-form";

export const metadata: Metadata = { title: "Sign in" };

type Search = { callbackUrl?: string; expired?: string; changed?: string };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (user) redirect(safeRelativePath(sp.callbackUrl, "/app"));

  const notice = sp.changed
    ? { tone: "success" as const, text: "Password changed. Sign in with your new password." }
    : sp.expired
      ? { tone: "info" as const, text: "Your session ended. Please sign in again." }
      : null;

  return (
    <main className="grid min-h-svh lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden flex-col justify-between bg-sidebar p-10 text-sidebar-foreground lg:flex">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-md bg-sidebar-primary font-heading text-base font-bold text-sidebar-primary-foreground">
            U
          </span>
          <span className="font-semibold">HRMS Payroll</span>
        </div>
        <div className="max-w-md">
          <p className="font-mono text-xs tracking-wider text-sidebar-muted uppercase">
            Internal system
          </p>
          <h1 className="mt-3 text-3xl font-semibold leading-tight">
            One login. Only the companies you are assigned to.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-sidebar-muted">
            Employee records, attendance and Philippine payroll for every Upright company, with
            payslips that never change once approved.
          </p>
        </div>
        <p className="text-xs text-sidebar-muted">Confidential. Access is logged.</p>
      </section>
      <section className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <span className="text-sm font-semibold">HRMS Payroll</span>
          </div>
          <h2 className="text-xl font-semibold">Sign in</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Use the account your administrator created for you.
          </p>
          <div className="mt-6">
            <LoginForm callbackUrl={safeRelativePath(sp.callbackUrl, "/app")} notice={notice} />
          </div>
        </div>
      </section>
    </main>
  );
}
