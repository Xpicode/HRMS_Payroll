import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <div className="max-w-md text-center">
        <p className="font-mono text-sm text-muted-foreground">404</p>
        <h1 className="mt-2 text-2xl font-semibold">Page not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The page does not exist, or your account does not have access to it.
        </p>
        <Button className="mt-6" render={<Link href="/app" />} nativeButton={false}>
          Back to the app
        </Button>
      </div>
    </main>
  );
}
