"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    username: "",
    firstName: "",
    lastName: "",
    password: "",
    confirmPassword: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit() {
    setError("");
    if (!form.username || !form.firstName || !form.lastName || !form.password || !form.confirmPassword) {
      setError("Please fill in all fields"); return;
    }
    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match"); return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: form.username,
          firstName: form.firstName,
          lastName: form.lastName,
          password: form.password,
        }),
      });
      if (res.ok) {
        router.push("/login");
      } else {
        const data = await res.json();
        setError(data.error || "Registration failed");
      }
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  const inputStyle = {
    background: "var(--color-surface)",
    border: "1px solid var(--color-border)",
    color: "var(--color-text)",
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Panel */}
      <div className="hidden md:flex w-1/2 flex-col items-center justify-center"
        style={{ background: "var(--color-primary)" }}>
        <Image src="/w-logo.png" alt="Nimitr Lab" width={280} height={160} className="object-contain" />
      </div>

      {/* Right Panel */}
      <div className="w-full md:w-1/2 flex items-center justify-center px-8"
        style={{ background: "var(--color-bg)" }}>
        <div className="w-full max-w-sm">

          {/* Title */}
          <div className="flex flex-col items-center mb-8">
            <h1 className="text-4xl font-bold tracking-widest mb-4" style={{ color: "var(--color-text-muted)" }}>
              REGISTER
            </h1>
            <div className="w-full h-px" style={{ background: "var(--color-sidebar)" }} />
          </div>

          {/* Form */}
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm mb-1" style={{ color: "var(--color-text)" }}>First Name</label>
                <input name="firstName" value={form.firstName} onChange={handleChange}
                  placeholder="John"
                  className="w-full px-4 py-3 rounded-xl outline-none text-sm" style={inputStyle} />
              </div>
              <div>
                <label className="block text-sm mb-1" style={{ color: "var(--color-text)" }}>Last Name</label>
                <input name="lastName" value={form.lastName} onChange={handleChange}
                  placeholder="Doe"
                  className="w-full px-4 py-3 rounded-xl outline-none text-sm" style={inputStyle} />
              </div>
            </div>

            <div>
              <label className="block text-sm mb-1" style={{ color: "var(--color-text)" }}>Username</label>
              <input name="username" value={form.username} onChange={handleChange}
                placeholder="Enter username"
                className="w-full px-4 py-3 rounded-xl outline-none text-sm" style={inputStyle} />
            </div>

            <div>
              <label className="block text-sm mb-1" style={{ color: "var(--color-text)" }}>Password</label>
              <input name="password" type="password" value={form.password} onChange={handleChange}
                placeholder="••••••••"
                className="w-full px-4 py-3 rounded-xl outline-none text-sm" style={inputStyle} />
            </div>

            <div>
              <label className="block text-sm mb-1" style={{ color: "var(--color-text)" }}>Confirm Password</label>
              <input name="confirmPassword" type="password" value={form.confirmPassword} onChange={handleChange}
                placeholder="••••••••"
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                className="w-full px-4 py-3 rounded-xl outline-none text-sm" style={inputStyle} />
            </div>

            {error && <p className="text-sm" style={{ color: "var(--color-danger-soft)" }}>{error}</p>}

            <button onClick={handleSubmit} disabled={loading}
              className="w-full py-3 rounded-xl text-sm font-medium"
              style={{ background: "var(--color-primary)", color: "var(--color-surface)", opacity: loading ? 0.7 : 1 }}>
              {loading ? "Creating account..." : "Create Account"}
            </button>

            <Link href="/login"
              className="block text-center w-full py-3 rounded-xl text-sm"
              style={{ background: "transparent", color: "var(--color-text-muted)" }}>
              ← Back to Login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}