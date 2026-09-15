import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { safeRelativePath } from "@/lib/request";
import { LoginForm } from "@/modules/auth/components/login-form";
import { AmbientBackground } from "@/components/app-shell/ambient-background";
import { ThemeSegment } from "@/components/theme-toggle";

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
        <AmbientBackground intensity="hero" position="absolute" />
        <div className="relative flex items-center gap-2 animate-fade-in">
          <span className="flex size-8 items-center justify-center rounded-lg bg-sidebar-primary font-heading text-base font-bold text-sidebar-primary-foreground shadow-[0_0_32px_-6px_var(--sidebar-primary),inset_0_1px_0_0_rgba(255,255,255,0.25)]">
            U
          </span>
          <span className="font-semibold">HRMS Payroll</span>
        </div>
        <div className="stagger relative max-w-lg [--stagger-step:90ms]">
          <p className="eyebrow flex items-center gap-2 text-sidebar-muted">
            <span
              className="size-1.5 rounded-full bg-sidebar-primary shadow-[0_0_8px_var(--sidebar-primary)]"
              aria-hidden
            />
            Internal system
          </p>
          <h1 className="text-gradient mt-4 text-5xl leading-[1.05] font-semibold tracking-[-0.03em] text-balance xl:text-6xl">
            One login. Only the companies{" "}
            <span className="text-accent-shimmer">you are assigned to</span>.
          </h1>
          <p className="mt-5 max-w-md text-base leading-relaxed text-sidebar-muted">
            Employee records, attendance and Philippine payroll for every Upright company, with
            payslips that never change once approved.
          </p>
          <ul className="mt-7 flex flex-wrap gap-2 text-xs text-sidebar-foreground/85">
            {["Multi-company", "Immutable payslips", "SSS · PhilHealth · Pag-IBIG · BIR"].map(
              (t) => (
                <li
                  key={t}
                  className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 backdrop-blur-sm"
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
      <section className="relative flex items-center justify-center p-6 sm:p-10">
        <div className="absolute top-4 right-4 sm:top-6 sm:right-6">
          <ThemeSegment />
        </div>
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
          <div className="surface rounded-2xl p-6">
            <LoginForm callbackUrl={safeRelativePath(sp.callbackUrl, "/app")} notice={notice} />
          </div>
        </div>
      </section>
    </main>
  );
}
