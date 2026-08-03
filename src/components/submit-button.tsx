"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({
  children,
  pendingLabel,
  className = "btn-primary",
  confirm,
  ...rest
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
  confirm?: string;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className">) {
  const { pending } = useFormStatus();
  const { disabled, ...buttonProps } = rest;

  return (
    <button
      type="submit"
      className={className}
      // Spreading `rest` last would let a caller's `disabled` clobber the
      // pending state, so the two are combined explicitly.
      disabled={pending || disabled}
      onClick={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault();
      }}
      {...buttonProps}
    >
      {pending ? (pendingLabel ?? "Working…") : children}
    </button>
  );
}
