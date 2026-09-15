"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * A card whose surface lights up under the cursor: a 300 px radial glow in the accent colour
 * follows the mouse (CSS does the drawing; this only writes --x/--y). Use it for cards that
 * are themselves clickable or that group interactive content. Static content stays on `Card`.
 */
export function SpotlightCard({
  className,
  interactive = true,
  children,
  ...props
}: React.ComponentProps<"div"> & { interactive?: boolean }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const onMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--x", `${e.clientX - r.left}px`);
    el.style.setProperty("--y", `${e.clientY - r.top}px`);
  };
  return (
    <div
      ref={ref}
      onMouseMove={onMouseMove}
      data-slot="spotlight-card"
      className={cn(
        "surface spotlight overflow-hidden rounded-2xl text-sm text-card-foreground",
        interactive && "surface-hover",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
