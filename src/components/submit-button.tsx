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

  return (
    <button
      type="submit"
      className={className}
      disabled={pending}
      onClick={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault();
      }}
      {...rest}
    >
      {pending ? (pendingLabel ?? "Working…") : children}
    </button>
  );
}
