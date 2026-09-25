import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase Auth client (email + Google). Null when env is missing so the
 * dashboard still boots read-only and shows a configuration notice instead
 * of crashing. Reads never need a session; writes attach the access token.
 */
const url = import.meta.env["VITE_SUPABASE_URL"] as string | undefined;
const anon = import.meta.env["VITE_SUPABASE_ANON_KEY"] as string | undefined;

export const supabase: SupabaseClient | null =
  url && anon ? createClient(url, anon) : null;

export const authConfigured = supabase !== null;
