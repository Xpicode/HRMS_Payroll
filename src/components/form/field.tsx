import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type FieldProps = {
  label: string;
  name: string;
  error?: string[] | undefined;
  hint?: React.ReactNode;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
};

/** Label + control + error/hint. Pass `fieldErrors[name]` as `error`. */
export function Field({ label, name, error, hint, required, className, children }: FieldProps) {
  const errorId = `${name}-error`;
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={name} className="text-[13px]">
        {label}
        {required ? <span className="ml-0.5 text-destructive">*</span> : null}
      </Label>
      {children}
      {error?.length ? (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {error[0]}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export function FieldGrid({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("grid gap-4 sm:grid-cols-2", className)}>{children}</div>;
}
