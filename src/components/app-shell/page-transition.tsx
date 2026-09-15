"use client";

import { usePathname } from "next/navigation";

/**
 * Re-mounts its children on every route change so the `.page-enter` animation plays once per
 * page, not once per app load. Pure CSS underneath (see globals.css); nothing here runs
 * on a timer.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="page-enter">
      {children}
    </div>
  );
}
