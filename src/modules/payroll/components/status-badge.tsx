import type { PayPeriodStatus, PayPeriodType } from "@/generated/prisma/enums";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PERIOD_STATUS_LABELS } from "../schema";

const STYLE: Record<PayPeriodStatus, string> = {
  DRAFT: "border-muted-foreground/30 bg-muted text-muted-foreground",
  COMPUTED: "border-brand/40 bg-brand/10 text-brand-foreground",
  APPROVED: "border-success/40 bg-success/10 text-success",
  RELEASED: "border-success/60 bg-success/20 text-success",
  LOCKED: "border-foreground/30 bg-foreground/10 text-foreground",
};

export function PeriodTypeBadge({ type }: { type: PayPeriodType }) {
  if (type !== "THIRTEENTH_MONTH") return null;
  return (
    <Badge variant="outline" className="border-brand/40 bg-brand/10 text-brand-foreground">
      13th month
    </Badge>
  );
}

export function PeriodStatusBadge({
  status,
  className,
}: {
  status: PayPeriodStatus;
  className?: string;
}) {
  return (
    <Badge variant="outline" className={cn(STYLE[status], className)}>
      {PERIOD_STATUS_LABELS[status]}
    </Badge>
  );
}
