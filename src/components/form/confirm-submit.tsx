"use client";

import { SubmitButton } from "./submit-button";

type Props = React.ComponentProps<typeof SubmitButton> & { message: string };

/** A submit button that asks for confirmation before the form posts. */
export function ConfirmSubmit({ message, onClick, ...props }: Props) {
  return (
    <SubmitButton
      {...props}
      onClick={(e) => {
        if (!window.confirm(message)) {
          e.preventDefault();
          return;
        }
        onClick?.(e);
      }}
    />
  );
}
