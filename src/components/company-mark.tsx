import { cn } from "@/lib/utils";

type Props = {
  company: { id: string; code: string; legalName: string; logoPath: string | null };
  size?: "sm" | "md" | "lg";
  className?: string;
};

const SIZES = { sm: "size-7 text-[11px]", md: "size-9 text-xs", lg: "size-16 text-lg" } as const;

/** Company avatar: the uploaded logo (served through the scoped file route) or the code as initials. */
export function CompanyMark({ company, size = "md", className }: Props) {
  const initials = company.code.slice(0, 3);
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-brand font-semibold tracking-wide text-brand-foreground",
        SIZES[size],
        className,
      )}
      aria-hidden
    >
      {company.logoPath ? (
        // eslint-disable-next-line @next/next/no-img-element -- served by our authenticated route; next/image cannot optimise it
        <img
          src={`/api/files/logos/${company.id}`}
          alt=""
          className="size-full bg-white object-contain p-0.5"
        />
      ) : (
        initials
      )}
    </span>
  );
}
