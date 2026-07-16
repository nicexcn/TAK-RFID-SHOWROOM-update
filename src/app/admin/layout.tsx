import { cookies } from "next/headers";
import { verifyToken, AUTH_COOKIE } from "@/lib/auth";
import AdminShell from "./AdminShell";

// Server component: resolve the signed-in user from the JWT cookie here, so the
// role-filtered sidebar + username render correctly on the first paint. Previously the
// client fetched /api/auth/me after mount, so the nav flashed empty until it resolved.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const token = (await cookies()).get(AUTH_COOKIE)?.value;
  const user = token ? verifyToken(token) : null;
  return (
    <AdminShell initialRole={user?.role ?? ""} initialUsername={user?.username ?? ""}>
      {children}
    </AdminShell>
  );
}
