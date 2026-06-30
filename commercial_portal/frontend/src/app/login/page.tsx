"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { portalApi } from "@/lib/api";
import { PortalShell } from "@/components/marketing";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await portalApi.login({ email, password });
      const requestedPath = new URLSearchParams(window.location.search).get("next");
      const safePath = requestedPath?.startsWith("/") && !requestedPath.startsWith("//")
        ? requestedPath
        : "/portal";
      router.replace(safePath);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <PortalShell active="login">
      <div className="portal-center">
        <div className="portal-auth">
        <section className="portal-brand">
          <span className="portal-kicker">GeoAtlas commercial API</span>
          <h1 className="portal-title">Sign in to the standalone developer portal.</h1>
          <p className="portal-subtitle">
            Manage API keys, view plan limits, review invoices, and access the private backoffice if your account is an admin.
          </p>
        </section>
        <section className="portal-card pad">
          {error ? <div className="portal-banner">{error}</div> : null}
          <form className="portal-form" onSubmit={onSubmit}>
            <div className="portal-field">
              <label htmlFor="email">Email</label>
              <input id="email" type="email" className="portal-input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoComplete="email" required />
            </div>
            <div className="portal-field">
              <label htmlFor="password">Password</label>
              <input id="password" type="password" className="portal-input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" autoComplete="current-password" required />
            </div>
            <button className="portal-button primary" type="submit" disabled={busy}>
              {busy ? "Signing in..." : "Sign in"}
            </button>
          </form>
          <p className="portal-muted">
            New here? <Link href="/register">Create an account</Link>
          </p>
        </section>
        </div>
      </div>
    </PortalShell>
  );
}
