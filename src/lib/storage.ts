import { writeFile, mkdir } from "fs/promises";
import path from "path";

// Allowed image types (MIME -> file extension)
const ALLOWED: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export interface SaveResult {
  url: string;
}

/** Validate the uploaded File by declared type + size. Returns an error string or null. */
export function validateImageMeta(file: File): string | null {
  if (!ALLOWED[file.type]) {
    return `Unsupported type "${file.type || "unknown"}". Allowed: PNG, JPG, WEBP, GIF.`;
  }
  if (file.size <= 0) return "Empty file.";
  if (file.size > MAX_BYTES) return `File too large (max ${MAX_BYTES / 1024 / 1024} MB).`;
  return null;
}

/** Sniff real magic bytes so a renamed/disguised file can't slip through. Returns MIME or null. */
export function sniffImageMime(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return "image/gif";
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) return "image/webp";
  return null;
}

export function extFor(mime: string): string {
  return ALLOWED[mime] || "bin";
}

function safeName(ext: string): string {
  const rand = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().slice(0, 12)
    : Math.random().toString(16).slice(2, 14);
  return `${Date.now()}-${rand}.${ext}`;
}

/**
 * Persist an image and return its public URL.
 * Uses Supabase Storage when configured (SUPABASE_URL + SUPABASE_SERVICE_KEY),
 * otherwise the local /public/uploads filesystem.
 */
export async function saveImage(buffer: Buffer, mime: string): Promise<SaveResult> {
  const ext = extFor(mime);
  const name = safeName(ext);

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (url && key) {
    const { createClient } = await import("@supabase/supabase-js");
    const bucket = process.env.SUPABASE_BUCKET || "product-images";
    const sb = createClient(url, key);
    const objectPath = `uploads/${name}`;
    const { error } = await sb.storage.from(bucket).upload(objectPath, buffer, {
      contentType: mime,
      upsert: false,
    });
    if (error) throw new Error(`Supabase upload failed: ${error.message}`);
    return { url: sb.storage.from(bucket).getPublicUrl(objectPath).data.publicUrl };
  }

  // Local fallback
  const dir = path.join(process.cwd(), "public", "uploads");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), buffer);
  return { url: `/uploads/${name}` };
}
