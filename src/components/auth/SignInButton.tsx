"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";

export default function SignInButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="btn btn-primary w-full rounded-full py-3.5 text-sm sm:text-base font-bold flex items-center justify-center gap-2 text-center disabled:opacity-75 disabled:cursor-not-allowed shadow-primary"
    >
      {pending ? (
        <>
          <Loader2 className="size-4 animate-spin text-white" />
          <span>Signing in...</span>
        </>
      ) : (
        "Sign in"
      )}
    </button>
  );
}
