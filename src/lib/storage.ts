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

// Upload constraints — shared by the signed-upload route (enforcement) AND the UI
// (so the help text can never drift from what the server actually allows).
export const ALLOWED_IMAGE_MIME = ["image/png", "image/jpeg", "image/webp", "image/gif"];
export const ALLOWED_VIDEO_MIME = ["video/mp4", "video/webm"];
export const ALLOWED_UPLOAD_MIME = [...ALLOWED_IMAGE_MIME, ...ALLOWED_VIDEO_MIME];
// Must be ≤ the Supabase PROJECT global max upload size, or updateBucket() fails entirely
// (and the bucket keeps its old mime/size limits). This project's global cap is 50 MB.
export const MAX_UPLOAD_MB = 50;
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

// True if a media URL points at an image (by extension) rather than a video. Used by the
// idle-media feature so /display and the settings preview render <img> vs <video>.
// Strips any query string first (e.g. Supabase signed-URL params).
export function isImageUrl(url: string): boolean {
  const clean = url.split("?")[0].toLowerCase();
  return ["png", "jpg", "jpeg", "webp", "gif"].some((e) => clean.endsWith("." + e));
}
