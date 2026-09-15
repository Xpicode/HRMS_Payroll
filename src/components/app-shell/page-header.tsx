import { cn } from "@/lib/utils";

type Props = {
  title: string;
  description?: React.ReactNode;
  eyebrow?: string;
  actions?: React.ReactNode;
  className?: string;
};

export function PageHeader({ title, description, eyebrow, actions, className }: Props) {
  return (
    <div className={cn("mb-6 flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="min-w-0">
        {eyebrow ? (
          <p className="eyebrow mb-1.5 flex items-center gap-2">
            <span
              className="size-1.5 rounded-full bg-primary shadow-[0_0_8px_var(--primary)]"
              aria-hidden
            />
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-gradient text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
