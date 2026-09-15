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
      <section className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-10 text-sidebar-foreground lg:flex">
        <div className="aurora" aria-hidden />
        <div className="grid-overlay" aria-hidden />
        <div className="relative flex items-center gap-2 animate-fade-in">
          <span className="flex size-8 items-center justify-center rounded-md bg-sidebar-primary font-heading text-base font-bold text-sidebar-primary-foreground shadow-[0_0_32px_-8px_var(--sidebar-primary)]">
            U
          </span>
          <span className="font-semibold">HRMS Payroll</span>
        </div>
        <div className="stagger relative max-w-md [--stagger-step:90ms]">
          <p className="flex items-center gap-2 font-mono text-xs tracking-wider text-sidebar-muted uppercase">
            <span className="size-1.5 rounded-full bg-sidebar-primary" aria-hidden />
            Internal system
          </p>
          <h1 className="mt-3 text-4xl font-semibold leading-[1.1] tracking-tight text-balance">
            One login. Only the companies you are assigned to.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-sidebar-muted">
            Employee records, attendance and Philippine payroll for every Upright company, with
            payslips that never change once approved.
          </p>
          <ul className="mt-6 flex flex-wrap gap-2 text-xs text-sidebar-foreground/80">
            {["Multi-company", "Immutable payslips", "SSS · PhilHealth · Pag-IBIG · BIR"].map(
              (t) => (
                <li
                  key={t}
                  className="rounded-full border border-sidebar-border/80 bg-sidebar-accent/40 px-2.5 py-1 backdrop-blur-sm"
                >
                  {t}
                </li>
              ),
            )}
          </ul>
        </div>
        <p className="relative text-xs text-sidebar-muted animate-fade-in">
          Confidential. Access is logged.
        </p>
      </section>
      <section className="flex items-center justify-center p-6 sm:p-10">
        <div className="stagger w-full max-w-sm [--stagger-step:70ms]">
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <span className="flex size-7 items-center justify-center rounded-md bg-primary font-heading text-sm font-bold text-primary-foreground">
              U
            </span>
            <span className="text-sm font-semibold">HRMS Payroll</span>
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">Sign in</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Use the account your administrator created for you.
          </p>
          <div className="mt-6 rounded-2xl bg-card p-6 shadow-[0_1px_2px_oklch(0.2_0.02_260/0.05),0_24px_48px_-24px_oklch(0.2_0.02_260/0.25)] ring-1 ring-foreground/10">
            <LoginForm callbackUrl={safeRelativePath(sp.callbackUrl, "/app")} notice={notice} />
          </div>
        </div>
      </section>
    </main>
  );
}
