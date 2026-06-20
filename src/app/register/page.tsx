"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

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
    background: "#fff",
    border: "1px solid #e6e5d8",
    color: "#4c4847",
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Panel */}
      <div className="hidden md:flex w-1/2 flex-col items-center justify-center"
        style={{ background: "#726c5a" }}>
        <Image src="/w-logo.png" alt="Nimitr Lab" width={280} height={160} className="object-contain" />
      </div>

      {/* Right Panel */}
      <div className="w-full md:w-1/2 flex items-center justify-center px-8"
        style={{ background: "#f5f2ee" }}>
        <div className="w-full max-w-sm">

          {/* Title */}
          <div className="flex flex-col items-center mb-8">
            <h1 className="text-4xl font-bold tracking-widest mb-4" style={{ color: "#726c5a" }}>
              REGISTER
            </h1>
            <div className="w-full h-px" style={{ background: "#cdc3ad" }} />
          </div>

          {/* Form */}
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm mb-1" style={{ color: "#4c4847" }}>First Name</label>
                <input name="firstName" value={form.firstName} onChange={handleChange}
                  placeholder="John"
                  className="w-full px-4 py-3 rounded-xl outline-none text-sm" style={inputStyle} />
              </div>
              <div>
                <label className="block text-sm mb-1" style={{ color: "#4c4847" }}>Last Name</label>
                <input name="lastName" value={form.lastName} onChange={handleChange}
                  placeholder="Doe"
                  className="w-full px-4 py-3 rounded-xl outline-none text-sm" style={inputStyle} />
              </div>
            </div>

            <div>
              <label className="block text-sm mb-1" style={{ color: "#4c4847" }}>Username</label>
              <input name="username" value={form.username} onChange={handleChange}
                placeholder="Enter username"
                className="w-full px-4 py-3 rounded-xl outline-none text-sm" style={inputStyle} />
            </div>

            <div>
              <label className="block text-sm mb-1" style={{ color: "#4c4847" }}>Password</label>
              <input name="password" type="password" value={form.password} onChange={handleChange}
                placeholder="••••••••"
                className="w-full px-4 py-3 rounded-xl outline-none text-sm" style={inputStyle} />
            </div>

            <div>
              <label className="block text-sm mb-1" style={{ color: "#4c4847" }}>Confirm Password</label>
              <input name="confirmPassword" type="password" value={form.confirmPassword} onChange={handleChange}
                placeholder="••••••••"
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                className="w-full px-4 py-3 rounded-xl outline-none text-sm" style={inputStyle} />
            </div>

            {error && <p className="text-sm" style={{ color: "#9f4a4a" }}>{error}</p>}

            <button onClick={handleSubmit} disabled={loading}
              className="w-full py-3 rounded-xl text-sm font-medium"
              style={{ background: "#726c5a", color: "#fff", opacity: loading ? 0.7 : 1 }}>
              {loading ? "Creating account..." : "Create Account"}
            </button>

            <button onClick={() => router.push("/login")}
              className="w-full py-3 rounded-xl text-sm"
              style={{ background: "transparent", color: "#9f886c" }}>
              ← Back to Login
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}