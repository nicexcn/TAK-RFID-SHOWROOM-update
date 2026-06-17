import { NextRequest, NextResponse } from "next/server";
import { validateImageMeta, sniffImageMime, saveImage } from "@/lib/storage";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // 1) declared type + size
    const metaErr = validateImageMeta(file);
    if (metaErr) return NextResponse.json({ error: metaErr }, { status: 400 });

    // 2) real content (magic bytes) — reject disguised/renamed files
    const buffer = Buffer.from(await file.arrayBuffer());
    const realMime = sniffImageMime(buffer);
    if (!realMime) {
      return NextResponse.json({ error: "File content is not a valid image" }, { status: 400 });
    }

    const { url } = await saveImage(buffer, realMime);
    return NextResponse.json({ url });
  } catch (error) {
    console.error("UPLOAD ERROR:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
