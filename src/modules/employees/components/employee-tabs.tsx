import Link from "next/link";
import { cn } from "@/lib/utils";

export type EmployeeTab = "details" | "pay" | "recurring" | "loans";

export function EmployeeTabs({
  companyId,
  employeeId,
  active,
  showLoans = true,
}: {
  companyId: string;
  employeeId: string;
  active: EmployeeTab;
  showLoans?: boolean;
}) {
  const base = `/app/${companyId}/employees/${employeeId}`;
  const tabs: { key: EmployeeTab; label: string; href: string }[] = [
    { key: "details", label: "Details", href: base },
    { key: "pay", label: "Pay settings", href: `${base}/pay` },
    { key: "recurring", label: "Recurring items", href: `${base}/recurring` },
    ...(showLoans ? [{ key: "loans" as const, label: "Loans", href: `${base}/loans` }] : []),
  ];
  return (
    <nav className="mb-6 flex gap-1 border-b" aria-label="Employee sections">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.key === active ? "page" : undefined}
          className={cn(
            "-mb-px border-b-2 px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground",
            t.key === active ? "border-primary font-medium text-foreground" : "border-transparent",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
