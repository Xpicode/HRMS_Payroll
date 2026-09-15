import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BuildingIcon, FileCheckIcon, LandmarkIcon, ShieldCheckIcon } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { safeRelativePath } from "@/lib/request";
import { LoginForm } from "@/modules/auth/components/login-form";
import { AmbientBackground } from "@/components/app-shell/ambient-background";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { ThemeSegment } from "@/components/theme-toggle";

export const metadata: Metadata = { title: "Sign in" };

type Search = { callbackUrl?: string; expired?: string; changed?: string };

const FEATURES = [
  { icon: BuildingIcon, label: "Multi-company", detail: "only your companies" },
  { icon: FileCheckIcon, label: "Frozen payslips", detail: "immutable on approval" },
  { icon: LandmarkIcon, label: "Statutory-ready", detail: "SSS · PhilHealth · HDMF · BIR" },
];

/**
 * Sign-in: a single centred stage. The ambient canvas (light pools, grid, noise) fills the
 * page; the form sits in a spotlight card that lights up under the cursor. No side panel, so
 * the same composition works from a phone to an ultrawide.
 */
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
    <main className="relative flex min-h-svh flex-col overflow-hidden">
      <AmbientBackground intensity="hero" />

      <header className="relative z-10 flex items-center justify-between px-5 py-4 sm:px-8 sm:py-6 animate-fade-in">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary font-heading text-base font-bold text-primary-foreground shadow-[0_0_28px_-6px_var(--primary),inset_0_1px_0_0_rgba(255,255,255,0.25)]">
            U
          </span>
          <span className="text-sm font-semibold tracking-tight">HRMS Payroll</span>
        </div>
        <ThemeSegment />
      </header>

      <section className="relative z-10 flex flex-1 items-center justify-center px-5 pb-12 sm:px-8">
        <div className="stagger w-full max-w-[28rem] [--stagger-step:90ms]">
          <p className="eyebrow flex items-center justify-center gap-2">
            <span
              className="size-1.5 rounded-full bg-primary shadow-[0_0_8px_var(--primary)]"
              aria-hidden
            />
            Internal system
          </p>
          <h1 className="text-gradient mt-4 text-center text-4xl leading-[1.05] font-semibold tracking-[-0.03em] text-balance sm:text-5xl">
            Welcome back
          </h1>
          <p className="mx-auto mt-3 max-w-xs text-center text-sm leading-relaxed text-muted-foreground sm:text-base">
            Sign in with the account your administrator created for you.
          </p>

          <SpotlightCard
            interactive={false}
            className="mt-8 p-6 sm:p-7 dark:shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_2px_20px_rgba(0,0,0,0.5),0_0_80px_-20px_rgba(94,106,210,0.35)]"
          >
            <div className="relative z-10">
              <LoginForm callbackUrl={safeRelativePath(sp.callbackUrl, "/app")} notice={notice} />
            </div>
          </SpotlightCard>

          <p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheckIcon className="size-3.5 text-success" />
            Confidential. Every sign-in is logged.
          </p>

          <ul className="mt-10 grid gap-2 sm:grid-cols-3">
            {FEATURES.map((f) => (
              <li
                key={f.label}
                className="surface flex items-center gap-3 rounded-xl px-3 py-2.5 sm:flex-col sm:items-start sm:gap-1.5 sm:px-3.5 sm:py-3"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
                  <f.icon className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-medium">{f.label}</span>
                  <span className="block text-[11px] text-muted-foreground">{f.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <footer className="relative z-10 px-5 pb-5 text-center text-[11px] text-muted-foreground/70 sm:px-8 animate-fade-in">
        Upright · HRMS &amp; Philippine payroll
      </footer>
    </main>
  );
}
