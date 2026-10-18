"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { createCompanyAndProvisionOwner } from "@/lib/auth/actions";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";

export default function CreateCompanyForm() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const check = async () => {
      const supabase = createSupabaseBrowserClient();
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) {
        router.replace("/login");
        return;
      }
      setChecking(false);
    };
    check();
  }, [router]);

  const [state, formAction, pending] = useActionState(
    createCompanyAndProvisionOwner,
    { ok: true, error: undefined },
  );

  if (checking) {
    return (
      <p className="mt-6 text-sm text-muted">Checking your session...</p>
    );
  }

  return (
    <form action={formAction} className="mt-6 grid gap-4">
      {state.error && (
        <div className="rounded-lg border border-danger/20 bg-danger/8 px-4 py-3 text-sm font-medium text-danger">
          {state.error}
        </div>
      )}

      <label className="grid gap-1.5 text-sm font-bold text-foreground">
        Your full name
        <input
          name="full_name"
          type="text"
          required
          placeholder="e.g. John Doe"
          className="h-12 w-full rounded-full border border-border/80 bg-background px-4 text-sm text-foreground outline-none focus:border-primary shadow-xs"
        />
      </label>

      <label className="grid gap-1.5 text-sm font-bold text-foreground">
        Company / workspace name
        <input
          name="company_name"
          type="text"
          required
          placeholder="e.g. Acme Corp"
          className="h-12 w-full rounded-full border border-border/80 bg-background px-4 text-sm text-foreground outline-none focus:border-primary shadow-xs"
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="btn btn-primary min-h-[48px] rounded-full w-full font-bold shadow-soft mt-2 cursor-pointer"
      >
        {pending ? "Creating workspace..." : "Create workspace"}
      </button>
    </form>
  );
}
