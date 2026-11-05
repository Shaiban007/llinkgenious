"use client";

import { useFormStatus } from "react-dom";
import { cn } from "@/lib/utils";

export function SubmitButton({
  children,
  pendingText = "Working…",
  className,
  variant = "primary",
  size,
  confirm,
  name,
  value,
}: {
  children: React.ReactNode;
  pendingText?: string;
  className?: string;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm";
  confirm?: string; // shows a browser confirmation before submitting
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
      className={cn(`btn-${variant}`, size === "sm" && "btn-sm", className)}
    >
      {pending ? pendingText : children}
    </button>
  );
}
