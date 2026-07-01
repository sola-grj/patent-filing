"use client";

import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";

type PmFormSubmitButtonProps = React.ComponentProps<typeof Button> & {
  pendingLabel: string;
  watchField?: string;
  watchValue?: string;
};

export function PmFormSubmitButton({
  children,
  pendingLabel,
  watchField,
  watchValue,
  disabled,
  ...props
}: PmFormSubmitButtonProps) {
  const { pending, data } = useFormStatus();
  const isCurrentAction =
    !watchField || !watchValue
      ? pending
      : pending && String(data?.get(watchField) ?? "") === watchValue;

  return (
    <Button disabled={pending || disabled} {...props}>
      {isCurrentAction ? pendingLabel : children}
    </Button>
  );
}
