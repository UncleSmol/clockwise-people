"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import BrandMark from "@/components/BrandMark";

export default function AuthCallbackClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState("Completing secure sign in...");
  const [canRetry, setCanRetry] = useState(false);
  const [isCompleting, setIsCompleting] = useState(true);

  const completeInvite = useCallback(async () => {
    setCanRetry(false);
    setIsCompleting(true);

    try {
      const hashParams = new URLSearchParams(window.location.hash.slice(1));
      const inviteId = searchParams.get("inviteId") ?? hashParams.get("inviteId");
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");
      const supabase = createSupabaseBrowserClient();

      if (!inviteId) {
        router.replace(
          `/login?message=${encodeURIComponent("Unable to complete sign in. Contact your administrator.")}`,
        );
        return;
      }

      let sessionAccessToken = accessToken;

      if (accessToken && refreshToken) {
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
      }

      if (!sessionAccessToken) {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError || !session?.access_token) {
          setMessage("This invite session could not be opened. Request a fresh invite link.");
          setCanRetry(true);
          setIsCompleting(false);
          return;
        }

        sessionAccessToken = session.access_token;
      }

      setMessage("Activating workspace access...");

      const response = await fetch("/auth/complete-invite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionAccessToken}`,
        },
        body: JSON.stringify({ inviteId }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;

        setMessage(payload?.error ?? "Unable to activate this invite. Request a fresh invite link.");
        setCanRetry(true);
        setIsCompleting(false);
        return;
      }

      window.history.replaceState(null, "", `/auth/callback?inviteId=${inviteId}`);
      router.replace("/auth/set-password");
      router.refresh();
    } catch {
      setMessage("We could not finish activating this invite. Try again or request a fresh invite link.");
      setCanRetry(true);
      setIsCompleting(false);
    }
  }, [router, searchParams]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      completeInvite();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [completeInvite]);

  return (
    <main className="grid min-h-screen place-items-center bg-background px-6 text-foreground">
      <section className="w-full max-w-md rounded-md border border-border bg-surface p-6 text-center shadow-sm">
        <BrandMark
          className="flex justify-center"
          imageSize={56}
          imageClassName="size-14 rounded-md"
          textClassName="text-sm font-semibold uppercase tracking-[0.18em] text-accent"
          priority
        />
        <h1 className="mt-3 text-2xl font-semibold text-foreground">Please wait</h1>
        <p className="mt-2 text-sm text-muted">{message}</p>
        {canRetry && (
          <button
            type="button"
            onClick={completeInvite}
            disabled={isCompleting}
            className="mt-5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {isCompleting ? "Checking..." : "Continue password setup"}
          </button>
        )}
      </section>
    </main>
  );
}
