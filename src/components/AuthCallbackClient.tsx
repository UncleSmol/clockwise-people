"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function AuthCallbackClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState("Completing secure sign in...");

  useEffect(() => {
    let cancelled = false;

    async function completeInvite() {
      const inviteId = searchParams.get("inviteId");
      const hashParams = new URLSearchParams(window.location.hash.slice(1));
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");

      if (!inviteId || !accessToken || !refreshToken) {
        router.replace(
          `/login?message=${encodeURIComponent("Unable to complete sign in. Contact your administrator.")}`,
        );
        return;
      }

      const supabase = createSupabaseBrowserClient();
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (sessionError) {
        router.replace(
          `/login?message=${encodeURIComponent("Unable to complete sign in. Contact your administrator.")}`,
        );
        return;
      }

      if (!cancelled) {
        setMessage("Activating workspace access...");
      }

      const response = await fetch("/auth/complete-invite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ inviteId }),
      });

      if (!response.ok) {
        await supabase.auth.signOut();
        router.replace(
          `/login?message=${encodeURIComponent("Unable to activate this invite. Contact your administrator.")}`,
        );
        return;
      }

      window.history.replaceState(null, "", `/auth/callback?inviteId=${inviteId}`);
      router.replace("/dashboard");
      router.refresh();
    }

    completeInvite();

    return () => {
      cancelled = true;
    };
  }, [router, searchParams]);

  return (
    <main className="grid min-h-screen place-items-center bg-background px-6 text-foreground">
      <section className="w-full max-w-md rounded-md border border-border bg-surface p-6 text-center shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-accent">
          ClockWise People
        </p>
        <h1 className="mt-3 text-2xl font-semibold text-foreground">Please wait</h1>
        <p className="mt-2 text-sm text-muted">{message}</p>
      </section>
    </main>
  );
}
