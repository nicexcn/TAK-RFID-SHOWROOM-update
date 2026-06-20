"use client";

import { supabaseBrowser } from "@/lib/supabaseBrowser";

// Client-side image upload via a SIGNED-URL direct upload (browser → Supabase
// Storage), so bytes never pass through a Next function or its ~4.5MB body limit.
// Requires Supabase to be configured. Retries transient failures; fails fast on
// deterministic ones (too large / wrong type / not configured).

const RETRIES = 2;
const DETERMINISTIC = /too large|invalid|unsupported|not a valid|exceeded the maximum|not configured/i;

async function signedUpload(file: File): Promise<string> {
  if (!supabaseBrowser) throw new Error("Image storage is not configured");
  const signRes = await fetch("/api/upload/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contentType: file.type }),
  });
  if (!signRes.ok) {
    const body = await signRes.json().catch(() => ({} as { error?: string }));
    throw new Error(body.error || `Could not start upload (HTTP ${signRes.status})`);
  }
  const { bucket, path, token, publicUrl } = await signRes.json();
  const { error } = await supabaseBrowser.storage
    .from(bucket)
    .uploadToSignedUrl(path, token, file, { contentType: file.type });
  if (error) throw new Error(error.message);
  return publicUrl;
}

export async function uploadImage(file: File): Promise<string> {
  let lastErr = "Upload failed";
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    try {
      return await signedUpload(file);
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
      if (DETERMINISTIC.test(lastErr) || attempt === RETRIES) break;
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  throw new Error(lastErr);
}
