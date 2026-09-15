import { PageSkeleton } from "@/components/app-shell/page-skeleton";

/** Shown inside the shell while an administration screen loads. */
export default function Loading() {
  return <PageSkeleton cards={0} />;
}
