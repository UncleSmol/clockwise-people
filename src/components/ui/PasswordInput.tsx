"use client";

import { forwardRef, useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";

export type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className = "", style, ...props }, ref) => {
    const [showPassword, setShowPassword] = useState(false);

    return (
      <div className="relative w-full">
        <input
          {...props}
          ref={ref}
          type={showPassword ? "text" : "password"}
          style={{ ...style, paddingRight: "2.75rem" }}
          className={`h-11 sm:h-12 w-full rounded-full border border-border bg-surface px-4 !pr-11 text-sm text-foreground placeholder-muted outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 ${className}`}
        />
        <button
          type="button"
          onClick={() => setShowPassword((prev) => !prev)}
          tabIndex={-1}
          className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 text-muted hover:text-foreground cursor-pointer transition-colors z-10 flex items-center justify-center rounded-full hover:bg-surface-muted focus:outline-none"
          aria-label={showPassword ? "Hide password" : "Show password"}
          title={showPassword ? "Hide password" : "Show password"}
        >
          {showPassword ? (
            <EyeOff className="size-4 shrink-0" />
          ) : (
            <Eye className="size-4 shrink-0" />
          )}
        </button>
      </div>
    );
  },
);

PasswordInput.displayName = "PasswordInput";

export default PasswordInput;

