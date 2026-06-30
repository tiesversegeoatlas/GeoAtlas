"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { portalApi } from "@/lib/api";
import { PortalShell } from "@/components/marketing";

export default function RegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [organization, setOrganization] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await portalApi.register({ full_name: fullName, organization, email, password });
      router.replace("/portal");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create account.");
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
          <h1 className="portal-title">Create a customer account.</h1>
          <p className="portal-subtitle">
            The portal provisions the free tier today and gives you a dashboard for API keys, usage limits, billing records, and admin access when applicable.
          </p>
        </section>
        <section className="portal-card pad">
          {error ? <div className="portal-banner">{error}</div> : null}
          <form className="portal-form" onSubmit={onSubmit}>
            <div className="portal-field">
              <label htmlFor="full_name">Full name</label>
              <input id="full_name" className="portal-input" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your name" autoComplete="name" required minLength={2} />
              <small>Used to identify you in the customer and billing dashboard.</small>
            </div>
            <div className="portal-field">
              <label htmlFor="organization">Organization</label>
              <input id="organization" className="portal-input" value={organization} onChange={(e) => setOrganization(e.target.value)} placeholder="Company or team (optional)" autoComplete="organization" />
            </div>
            <div className="portal-field">
              <label htmlFor="email">Email</label>
              <input id="email" type="email" className="portal-input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoComplete="email" required />
              <small>You will use this address to sign in.</small>
            </div>
            <div className="portal-field">
              <label htmlFor="password">Password</label>
              <input id="password" type="password" className="portal-input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Minimum 8 characters" autoComplete="new-password" required minLength={8} />
              <small>Use at least 8 characters and avoid reusing another account’s password.</small>
            </div>
            <button className="portal-button primary" type="submit" disabled={busy}>
              {busy ? "Creating..." : "Create account"}
            </button>
          </form>
          <p className="portal-muted">
            Already registered? <Link href="/login">Sign in</Link>
          </p>
        </section>
        </div>
      </div>
    </PortalShell>
  );
}
