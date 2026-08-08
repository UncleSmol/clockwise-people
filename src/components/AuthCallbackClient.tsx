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
      const code = searchParams.get("code");
      const inviteId = searchParams.get("inviteId") ?? hashParams.get("inviteId");
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");
      const type = hashParams.get("type") ?? searchParams.get("type");
      const supabase = createSupabaseBrowserClient();

      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

        if (exchangeError) {
          router.replace(
            `/login?message=${encodeURIComponent("Unable to complete sign in. Contact your administrator.")}`,
          );
          return;
        }

        const clean = new URL(window.location.href);
        clean.searchParams.delete("code");
        clean.searchParams.delete("type");
        window.history.replaceState(null, "", clean.pathname + clean.search);

        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!inviteId && session) {
          router.replace("/auth/set-password");
          router.refresh();
          return;
        }

        if (inviteId && session?.access_token) {
          const response = await fetch("/auth/complete-invite", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
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
          return;
        }

        router.replace("/auth/set-password");
        router.refresh();
        return;
      }

      if (!inviteId) {
        if (accessToken && refreshToken && type === "invite") {
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

          window.history.replaceState(null, "", "/auth/callback");
          router.replace("/auth/set-password");
          router.refresh();
          return;
        }

        if (accessToken && refreshToken && type === "signup") {
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

          window.history.replaceState(null, "", "/auth/callback");
          router.replace("/auth/create-company");
          router.refresh();
          return;
        }

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
    <main className="grid min-h-screen place-items-center px-6 text-foreground">
      <section className="w-full max-w-sm">
        <BrandMark
          className="mb-6 flex justify-center"
          imageSize={48}
          imageClassName="size-12 rounded-lg"
          textClassName="text-lg font-bold text-primary"
          priority
        />
        <div className="card p-6 text-center">
          <h1 className="text-lg font-bold text-foreground">Please wait</h1>
          <p className="mt-1 text-sm text-muted">{message}</p>
          {canRetry && (
            <button
              type="button"
              onClick={completeInvite}
              disabled={isCompleting}
              className="btn btn-accent mt-5"
            >
              {isCompleting ? "Checking..." : "Continue password setup"}
            </button>
          )}
        </div>
      </section>
    </main>
  );
}
