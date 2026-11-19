import { createBrowserClient } from "@supabase/ssr";

const FALLBACK_SUPABASE_URL = "https://placeholder-build-only.supabase.co";
const FALLBACK_SUPABASE_ANON_KEY = "placeholder-build-anon-key";

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || FALLBACK_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || FALLBACK_SUPABASE_ANON_KEY;

  return createBrowserClient(url, anonKey);
}
