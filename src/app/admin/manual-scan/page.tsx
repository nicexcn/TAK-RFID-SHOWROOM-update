// TAK 28/8: Manual Scan merged into Surface Scan — staff now hand-pick items from the
// "+ Add item" picker on the Surface Scan page itself. Anyone landing on the old URL is
// redirected there (the role grants were removed, so the proxy also redirects — this
// page covers in-app links and bookmarks that bypass the role check).
import { redirect } from "next/navigation";

export default function ManualScanPage() {
  redirect("/admin/rfid");
}
