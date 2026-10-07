"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";

export default function SignInButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="btn btn-accent w-full flex items-center justify-center gap-2 text-center disabled:opacity-75 disabled:cursor-not-allowed"
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
