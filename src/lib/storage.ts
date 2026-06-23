// Allowed image types (MIME -> file extension). Used to derive an upload object's
// extension when minting signed upload URLs (see /api/upload/sign). Uploads go
// browser-direct to Supabase Storage, so there is no server-side file handling here.
const ALLOWED: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
};

export function extFor(mime: string): string {
  return ALLOWED[mime] || "bin";
}
