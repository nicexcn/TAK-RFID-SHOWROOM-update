"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
      <div className="hidden md:flex w-1/2 flex-col items-center justify-center" style={{ background: "#726c5a" }}>
        <Image src="/w-logo.png" alt="Nimitr Lab" width={300} height={180} className="object-contain" />
      </div>
      <div className="w-full md:w-1/2 flex items-center justify-center px-8" style={{ background: "#f5f2ee" }}>
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center mb-8">
            <h1 className="text-4xl font-bold tracking-widest mb-4" style={{ color: "#726c5a" }}>LOG IN</h1>
            <div className="w-full h-px" style={{ background: "#cdc3ad" }} />
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm mb-1" style={{ color: "#4c4847" }}>Username</label>
              <input type="text" value={username} onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()} placeholder="Enter your username"
                className="w-full px-4 py-3 rounded-xl outline-none text-sm"
                style={{ background: "#fff", border: "1px solid #e6e5d8", color: "#4c4847" }} />
            </div>
            <div>
              <label className="block text-sm mb-1" style={{ color: "#4c4847" }}>Password</label>
              <div className="relative">
                <input type={showPassword ? "text" : "password"} value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 rounded-xl outline-none text-sm pr-12"
                  style={{ background: "#fff", border: "1px solid #e6e5d8", color: "#4c4847" }} />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2" style={{ color: "#6f5f48" }}>
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <button onClick={handleLogin} disabled={loading}
              className="w-full py-3 rounded-xl text-sm font-medium transition-opacity"
              style={{ background: "#726c5a", color: "#fff", opacity: loading ? 0.7 : 1 }}>
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
