"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseConfig } from "./config";

let browserClient: SupabaseClient | undefined;

export function createSupabaseBrowserClient() {
  if (browserClient) {
    return browserClient;
  }

  const { url, anonKey } = requireSupabaseConfig();
  browserClient = createBrowserClient(url, anonKey);
  return browserClient;
}
