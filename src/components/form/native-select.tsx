import { cn } from "@/lib/utils";
import { ChevronDownIcon } from "lucide-react";

/**
 * A styled native <select>. Native controls post with plain forms, need no client
 * state, and are keyboard-friendly — right for dense data-entry screens.
 */
export function NativeSelect({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <div className="relative">
      <select
        className={cn(
          "h-8 w-full appearance-none rounded-lg border border-input bg-transparent py-1 pr-8 pl-2.5 text-sm outline-none transition-[border-color,box-shadow] duration-200 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive dark:bg-[#0f0f12] dark:focus-visible:shadow-[0_0_20px_-6px_rgba(94,106,210,0.5)]",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}
