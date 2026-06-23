import { NextRequest, NextResponse } from "next/server";
import { extFor } from "@/lib/storage";

// Mint a one-shot signed upload URL so the browser can PUT an image straight to
// Supabase Storage — bypassing this function (and Vercel's ~4.5MB body limit) and
// offloading upload bandwidth. This is the ONLY image upload entry point: the bytes
// never pass through a function, so type/size are enforced at the storage layer
// (bucket allowed MIME types + size limit), ensured once below.

const ALLOWED_MIME = ["image/png", "image/jpeg", "image/webp", "image/gif", "video/mp4", "video/webm"];
const MAX_BYTES = 100 * 1024 * 1024; // 100 MB cap — covers the /display idle-loop video (images are far smaller)

let bucketEnsured = false; // module-cached: only reconfigure the bucket once per cold start

function safeName(ext: string): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 12)
      : Math.random().toString(16).slice(2, 14);
  return `${Date.now()}-${rand}.${ext}`;
}

export async function POST(req: NextRequest) {
  try {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    // Signing needs the service key. When it's absent (e.g. local dev on the
    // filesystem fallback), tell the client to use the route-through endpoint.
    if (!url || !key) {
      return NextResponse.json({ error: "Signed uploads not configured", fallback: true }, { status: 501 });
    }

    const { contentType } = await req.json().catch(() => ({}));
    if (!ALLOWED_MIME.includes(contentType)) {
      return NextResponse.json({ error: "Unsupported file type. Allowed: PNG, JPG, WEBP, GIF, MP4, WEBM." }, { status: 400 });
    }

    const { createClient } = await import("@supabase/supabase-js");
    const bucket = process.env.SUPABASE_BUCKET || "product-images";
    const sb = createClient(url, key);

    // Enforce type + size at the storage layer (replaces the function-side checks).
    if (!bucketEnsured) {
      const { error: cfgErr } = await sb.storage.updateBucket(bucket, {
        public: true,
        fileSizeLimit: MAX_BYTES,
        allowedMimeTypes: ALLOWED_MIME,
      });
      if (cfgErr) console.warn("[upload/sign] could not enforce bucket limits:", cfgErr.message);
      else bucketEnsured = true;
    }

    const objectPath = `uploads/${safeName(extFor(contentType))}`;
    const { data, error } = await sb.storage.from(bucket).createSignedUploadUrl(objectPath);
    if (error || !data) {
      return NextResponse.json({ error: `Could not create upload URL: ${error?.message}` }, { status: 500 });
    }

    const publicUrl = sb.storage.from(bucket).getPublicUrl(objectPath).data.publicUrl;
    return NextResponse.json({ bucket, path: data.path, token: data.token, publicUrl });
  } catch (error) {
    console.error("UPLOAD SIGN ERROR:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
