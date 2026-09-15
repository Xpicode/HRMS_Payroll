"use client";

import { useRouter } from "next/navigation";
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CompanyMark } from "@/components/company-mark";
import type { CompanySummary } from "@/lib/session";
import { cn } from "@/lib/utils";

type Props = { companies: CompanySummary[]; currentCompanyId: string | null; rail?: boolean };

/**
 * The current company is the most important piece of context on every screen —
 * encoding into the wrong company is the costliest mistake. So it is big, gold, and first.
 */
export function CompanySwitcher({ companies, currentCompanyId, rail }: Props) {
  const router = useRouter();
  const current = companies.find((c) => c.id === currentCompanyId) ?? null;

  if (companies.length === 0) {
    return (
      <div
        className={cn(
          "rounded-lg border border-dashed border-sidebar-border p-3 text-xs text-sidebar-muted",
          rail && "md:max-lg:sr-only",
        )}
      >
        No companies assigned yet.
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex w-full items-center gap-3 rounded-lg border border-sidebar-border bg-sidebar-accent/60 p-2 text-left outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring",
          rail && "md:max-lg:justify-center md:max-lg:p-1.5",
        )}
        aria-label="Switch company"
        title={rail && current ? `${current.code} — switch company` : undefined}
      >
        {current ? (
          <>
            <CompanyMark company={current} />
            <span className={cn("min-w-0 flex-1", rail && "md:max-lg:sr-only")}>
              <span className="block truncate text-sm font-semibold text-sidebar-foreground">
                {current.tradeName ?? current.legalName}
              </span>
              <span className="block truncate font-mono text-[11px] text-sidebar-muted">
                {current.code}
              </span>
            </span>
          </>
        ) : (
          <span className={cn("min-w-0 flex-1", rail && "md:max-lg:sr-only")}>
            <span className="block text-sm font-semibold text-sidebar-foreground">
              Choose a company
            </span>
            <span className="block text-[11px] text-sidebar-muted">
              {companies.length} available
            </span>
          </span>
        )}
        <ChevronsUpDownIcon
          className={cn("size-4 shrink-0 text-sidebar-muted", rail && "md:max-lg:hidden")}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-(--anchor-width) min-w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Companies</DropdownMenuLabel>
          {companies.map((c) => (
            <DropdownMenuItem
              key={c.id}
              onClick={() => router.push(`/app/${c.id}`)}
              className="gap-2.5 py-1.5"
            >
              <CompanyMark company={c} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{c.tradeName ?? c.legalName}</span>
                <span className="block font-mono text-[11px] text-muted-foreground">{c.code}</span>
              </span>
              {c.id === currentCompanyId ? <CheckIcon className="size-4" /> : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
