"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/** True after hydration only, so server and first client render agree (next-themes reads localStorage). */
const noop = () => () => {};
const useMounted = () =>
  React.useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );

const OPTIONS = [
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
  { value: "system", label: "System", icon: MonitorIcon },
] as const;

/** Three menu rows (Light / Dark / System) for the account dropdown. */
export function ThemeMenuItems() {
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();
  return (
    <>
      {OPTIONS.map((o) => (
        <DropdownMenuItem
          key={o.value}
          onClick={() => setTheme(o.value)}
          aria-checked={mounted && theme === o.value}
          role="menuitemradio"
          className={cn(mounted && theme === o.value && "bg-accent text-accent-foreground")}
        >
          <o.icon />
          {o.label}
          {mounted && theme === o.value ? (
            <span className="ml-auto size-1.5 rounded-full bg-primary shadow-[0_0_8px_var(--primary)]" />
          ) : null}
        </DropdownMenuItem>
      ))}
    </>
  );
}

/** A segmented Light / Dark / System control for places without a menu (sign-in, mobile header). */
export function ThemeSegment({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();
  const current = mounted ? theme : undefined;
  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full border border-border bg-card/60 p-0.5 backdrop-blur-md",
        className,
      )}
    >
      {OPTIONS.map((o) => {
        const active = current === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={o.label}
            title={o.label}
            onClick={() => setTheme(o.value)}
            className={cn(
              "flex size-7 items-center justify-center rounded-full text-muted-foreground transition-[background-color,color,box-shadow] duration-200 ease-out-expo hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none",
              active && "bg-primary/15 text-primary shadow-[0_0_12px_-3px_var(--primary)]",
            )}
          >
            <o.icon className="size-3.5" />
          </button>
        );
      })}
    </div>
  );
}
