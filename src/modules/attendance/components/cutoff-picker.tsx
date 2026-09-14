import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  formatCutoff,
  nextCutoff,
  previousCutoff,
  type Cutoff,
  type CutoffFrequency,
} from "@/lib/dates";

type Props = {
  basePath: string;
  cutoff: Cutoff;
  frequency: CutoffFrequency;
};

export function cutoffHref(basePath: string, c: Cutoff): string {
  return `${basePath}?start=${c.start}&end=${c.end}`;
}

/** Previous / label / next, plus a month jump. Server component: plain links and a GET form. */
export function CutoffPicker({ basePath, cutoff, frequency }: Props) {
  const prev = previousCutoff(frequency, cutoff);
  const next = nextCutoff(frequency, cutoff);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="outline"
        size="icon-sm"
        aria-label="Previous cutoff"
        render={<Link href={cutoffHref(basePath, prev)} />}
        nativeButton={false}
      >
        <ChevronLeftIcon />
      </Button>
      <span className="min-w-36 text-center font-mono text-sm font-medium tabular">
        {formatCutoff(cutoff)}
      </span>
      <Button
        variant="outline"
        size="icon-sm"
        aria-label="Next cutoff"
        render={<Link href={cutoffHref(basePath, next)} />}
        nativeButton={false}
      >
        <ChevronRightIcon />
      </Button>
      <form action={basePath} className="ml-2 flex items-center gap-1">
        <input
          type="month"
          name="month"
          defaultValue={cutoff.start.slice(0, 7)}
          aria-label="Jump to month"
          className="h-7 rounded-md border border-input bg-transparent px-2 text-xs"
        />
        <input type="hidden" name="half" value={cutoff.sequenceInMonth} />
        <Button type="submit" variant="ghost" size="sm">
          Go
        </Button>
      </form>
    </div>
  );
}
