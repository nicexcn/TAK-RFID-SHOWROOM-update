"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import SecretInput from "@/components/SecretInput";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (res.ok) { router.push("/admin"); }
      else { setError("Invalid username or password"); }
    } catch { setError("Something went wrong. Please try again."); }
    finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen flex">
      <div className="hidden md:flex w-1/2 flex-col items-center justify-center" style={{ background: "var(--color-primary)" }}>
        <Image src="/w-logo.png" alt="Nimitr Lab" width={300} height={71} className="object-contain" priority />
      </div>
      <div className="w-full md:w-1/2 flex items-center justify-center px-8" style={{ background: "var(--color-bg)" }}>
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center mb-8">
            <h1 className="text-4xl font-bold tracking-widest mb-4" style={{ color: "var(--color-text-muted)" }}>LOG IN</h1>
            <div className="w-full h-px" style={{ background: "var(--color-sidebar)" }} />
          </div>
          <div className="space-y-4">
            <div>
              <label htmlFor="username" className="block text-sm mb-1" style={{ color: "var(--color-text)" }}>Username</label>
              <input id="username" type="text" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()} placeholder="Enter your username"
                className="w-full px-4 py-3 rounded-xl outline-none text-sm"
                style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text)" }} />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm mb-1" style={{ color: "var(--color-text)" }}>Password</label>
              <SecretInput id="password" value={password} onChange={setPassword}
                autoComplete="current-password"
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                placeholder="••••••••"
                secretLabel="password"
                className="w-full px-4 py-3 rounded-xl outline-none text-sm"
                style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text)" }} />
            </div>
            {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
            <button onClick={handleLogin} disabled={loading}
              className="w-full py-3 rounded-xl text-sm font-medium transition-opacity"
              style={{ background: "var(--color-primary)", color: "var(--color-surface)", opacity: loading ? 0.7 : 1 }}>
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
