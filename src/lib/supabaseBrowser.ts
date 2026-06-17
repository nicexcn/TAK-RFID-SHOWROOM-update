"use client";

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Browser-only Supabase client used PURELY for Realtime Broadcast — a lightweight
 * "something changed, refetch" signal. No table data is ever read through it:
 * the publishable key has no privileges on the public schema (PostgREST returns
 * 401 "permission denied for schema public"), so exposing it client-side is safe.
 *
 * Null when the public env vars aren't set, so the display page degrades to
 * plain polling instead of crashing.
 */
export const supabaseBrowser =
  url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;

export const DISPLAY_CHANNEL = "sessions-display";
export const DISPLAY_EVENT = "changed";
