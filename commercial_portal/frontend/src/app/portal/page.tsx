"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { portalApi, PortalDashboard } from "@/lib/api";
import { PortalShell } from "@/components/marketing";

export default function PortalPage() {
  const router = useRouter();
  const [dashboard, setDashboard] = useState<PortalDashboard | null>(null);
  const [label, setLabel] = useState("Primary integration");
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    portalApi.me().then(setDashboard).catch(() => router.replace("/login")).finally(() => setLoading(false));
  }, [router]);

  const plan = useMemo(() => dashboard?.plan, [dashboard]);
  const usage = useMemo(() => {
    const keys = dashboard?.api_keys ?? [];
    const activeKeys = keys.filter((key) => key.active);
    const monthlyUsed = keys.reduce((total, key) => total + key.monthly_request_count, 0);
    const monthlyCapacity = activeKeys.reduce((total, key) => total + key.monthly_request_limit, 0);
    const remaining = Math.max(0, monthlyCapacity - monthlyUsed);
    const utilization = monthlyCapacity > 0
      ? Math.min(100, (monthlyUsed / monthlyCapacity) * 100)
      : 0;
    return { activeKeys, monthlyUsed, monthlyCapacity, remaining, utilization };
  }, [dashboard]);

  const createKey = async (event: FormEvent) => {
    event.preventDefault();
    if (label.trim().length < 2) {
      setError("Give this key a recognizable name with at least 2 characters.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await portalApi.createKey(label.trim());
      setRevealedKey(created.plaintext_key || null);
      setCopied(false);
      const refreshed = await portalApi.me();
      setDashboard(refreshed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create key.");
    } finally {
      setBusy(false);
    }
  };

  const revokeKey = async (id: string) => {
    setError(null);
    setRevokingId(id);
    try {
      await portalApi.revokeKey(id);
      setDashboard(await portalApi.me());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to revoke this API key.");
    } finally {
      setRevokingId(null);
    }
  };

  const copyRevealedKey = async () => {
    if (!revealedKey) return;
    try {
      await navigator.clipboard.writeText(revealedKey);
      setCopied(true);
    } catch {
      setError("Copy was blocked by the browser. Select the key and copy it manually.");
    }
  };

  const logout = async () => {
    await portalApi.logout();
    router.replace("/login");
  };

  if (loading) {
    return <PortalShell active="portal"><div className="portal-center"><div className="portal-card pad">Loading dashboard...</div></div></PortalShell>;
  }

  if (!dashboard) {
    return null;
  }

  return (
    <PortalShell active="portal">
      <div className="portal-shell">
      <div className="portal-container">
        <div className="portal-topbar">
          <div className="portal-brand">
            <span className="portal-kicker">Customer dashboard</span>
            <h1 className="portal-title">Manage your GeoAtlas API access.</h1>
            <p className="portal-subtitle">Generate credentials, review limits, and track your commercial account.</p>
          </div>
          <div className="portal-actions">
            {dashboard.hidden_admin_slug ? <Link className="portal-button" href={`/backoffice/${dashboard.hidden_admin_slug}`}>Open backoffice</Link> : null}
            <button className="portal-button" onClick={logout}>Sign out</button>
          </div>
        </div>

        {error ? <div className="portal-banner">{error}</div> : null}
        {revealedKey ? (
          <div className="portal-banner portal-success portal-key-reveal" role="status">
            <div>
              <strong>Your new API key</strong>
              <p>Copy it now. For security, the full key will not be shown again.</p>
              <code>{revealedKey}</code>
            </div>
            <button className="portal-button" type="button" onClick={() => void copyRevealedKey()}>
              {copied ? "Copied" : "Copy key"}
            </button>
          </div>
        ) : null}

        <div className="portal-grid stats">
          <section className="portal-card pad portal-stat">
            <span className="portal-kicker">Requests this month</span>
            <strong>{usage.monthlyUsed.toLocaleString("en-IN")}</strong>
            <p className="portal-muted">Across all current and previously used keys</p>
          </section>
          <section className="portal-card pad portal-stat">
            <span className="portal-kicker">Requests remaining</span>
            <strong>{usage.remaining.toLocaleString("en-IN")}</strong>
            <p className="portal-muted">Across active key allowances</p>
          </section>
          <section className="portal-card pad portal-stat">
            <span className="portal-kicker">Monthly utilization</span>
            <strong>{usage.utilization.toFixed(1)}%</strong>
            <p className="portal-muted">{usage.monthlyCapacity.toLocaleString("en-IN")} total active-key capacity</p>
          </section>
          <section className="portal-card pad portal-stat">
            <span className="portal-kicker">Active keys</span>
            <strong>{usage.activeKeys.length}/{plan?.max_api_keys ?? 0}</strong>
            <p className="portal-muted">Max {plan?.max_api_keys ?? 0} active keys</p>
          </section>
        </div>

        <section className="portal-card pad portal-usage-analytics">
          <div className="portal-section-heading">
            <div><span className="portal-kicker">Usage analytics</span><h2>Monthly API consumption</h2></div>
            <p>Usage is calculated from your issued keys and resets with each UTC calendar month.</p>
          </div>
          <div className="portal-usage-overview">
            <div>
              <strong>{usage.monthlyUsed.toLocaleString("en-IN")}</strong>
              <span>of {usage.monthlyCapacity.toLocaleString("en-IN")} available requests used</span>
            </div>
            <strong>{usage.utilization.toFixed(1)}%</strong>
          </div>
          <div className="portal-usage-track" role="progressbar" aria-label="Monthly API usage" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(usage.utilization)}>
            <span style={{ width: `${usage.utilization}%` }} />
          </div>
          <div className="portal-key-analytics">
            {dashboard.api_keys.length ? dashboard.api_keys.map((key) => {
              const percent = key.monthly_request_limit > 0
                ? Math.min(100, (key.monthly_request_count / key.monthly_request_limit) * 100)
                : 0;
              return (
                <article key={key.id}>
                  <div>
                    <span className={`portal-tag ${key.active ? "success" : "danger"}`}>{key.active ? "Active" : "Revoked"}</span>
                    <strong>{key.label}</strong>
                    <small><code>{key.key_prefix}••••</code></small>
                  </div>
                  <div className="portal-key-analytics-value">
                    <strong>{key.monthly_request_count.toLocaleString("en-IN")}</strong>
                    <span>of {key.monthly_request_limit.toLocaleString("en-IN")}</span>
                  </div>
                  <div className="portal-usage-track small"><span style={{ width: `${percent}%` }} /></div>
                </article>
              );
            }) : <div className="portal-empty-state"><strong>No usage to display</strong><p>Generate an API key to begin tracking requests.</p></div>}
          </div>
        </section>

        <div className="portal-grid main" style={{ marginTop: 18 }}>
          <section className="portal-card pad">
            <h2>API keys</h2>
            <p className="portal-muted">Use a separate named key for each application so credentials are easy to identify and revoke.</p>
            <form className="portal-form" onSubmit={createKey}>
              <div className="portal-key-create">
                <div className="portal-field">
                  <label htmlFor="key-label">Key name</label>
                  <input id="key-label" className="portal-input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Example: Production dashboard" required minLength={2} />
                  <small>This name is only for your reference; it is not part of the secret key.</small>
                </div>
                <button className="portal-button primary" type="submit" disabled={busy}>{busy ? "Generating..." : "Generate key"}</button>
              </div>
            </form>
            <div className="portal-list">
              {dashboard.api_keys.map((key) => (
                <div className="portal-row" key={key.id}>
                  <div>
                    <strong>{key.label}</strong>
                    <div className="portal-muted">{key.key_prefix}•••• • {key.monthly_request_count}/{key.monthly_request_limit} used</div>
                  </div>
                  <div className="portal-inline">
                    <span className={`portal-tag ${key.active ? "success" : "danger"}`}>{key.active ? "Active" : "Revoked"}</span>
                    {key.active ? <button className="portal-button" disabled={revokingId !== null} onClick={() => void revokeKey(key.id)}>{revokingId === key.id ? "Revoking..." : "Revoke key"}</button> : null}
                  </div>
                </div>
              ))}
              {!dashboard.api_keys.length ? <p className="portal-muted">No API keys yet. Generate your first key above.</p> : null}
            </div>
          </section>

          <aside className="portal-grid">
            <section className="portal-card pad">
              <h2>Account</h2>
              <div className="portal-list">
                <div><strong>{dashboard.user.full_name}</strong><div className="portal-muted">{dashboard.user.email}</div></div>
                <div className="portal-muted">Organization: {dashboard.user.organization || "Independent"}</div>
                <div className="portal-muted">Plan: {plan?.name || "Free"} · INR {plan?.monthly_price_inr ?? 0}/month</div>
                <div className="portal-muted">Rate limit: {plan?.requests_per_minute ?? 0} requests/minute</div>
                <div className="portal-muted">Billing status: {dashboard.user.billing_status}</div>
              </div>
            </section>
            <section className="portal-card pad">
              <h2>Integration</h2>
              <p className="portal-muted">Use any active key against the GeoAtlas public API.</p>
              <code className="portal-code">{`curl "$GEOATLAS_API_BASE_URL/api/v1/public/items" \\
  -H "X-API-Key: YOUR_KEY"`}</code>
              <p className="portal-muted"><Link href="/documentation">Read the complete API documentation</Link></p>
            </section>
            <section className="portal-card pad">
              <h2>Billing records</h2>
              <div className="portal-list">
                {dashboard.invoices.map((invoice) => (
                  <div className="portal-row" key={invoice.id}>
                    <div>
                      <strong>{invoice.plan_code.toUpperCase()}</strong>
                      <div className="portal-muted">{invoice.status}</div>
                    </div>
                    <div className="portal-muted">INR {invoice.amount_inr}</div>
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </div>
      </div>
      </div>
    </PortalShell>
  );
}
