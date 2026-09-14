"use client";

import { useFormStatus } from "react-dom";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = React.ComponentProps<typeof Button> & { pendingText?: string };

export function SubmitButton({ children, pendingText, disabled, ...props }: Props) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || disabled} {...props}>
      {pending ? <Loader2Icon className="animate-spin" data-icon="inline-start" /> : null}
      {pending && pendingText ? pendingText : children}
    </Button>
  );
}
