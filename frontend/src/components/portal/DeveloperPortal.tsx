"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Copy, KeyRound, LogOut, Plus, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  createPortalApiKey,
  fetchPortalDashboard,
  fetchPortalPlans,
  logoutPortalAccount,
  revokePortalApiKey,
  type PortalDashboard,
  type PortalPlan,
} from "@/lib/portal-api";

export function DeveloperPortal() {
  const router = useRouter();
  const [dashboard, setDashboard] = useState<PortalDashboard | null>(null);
  const [plans, setPlans] = useState<PortalPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [keyLabel, setKeyLabel] = useState("Primary integration");
  const [latestSecret, setLatestSecret] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchPortalDashboard(), fetchPortalPlans()])
      .then(([dash, portalPlans]) => {
        setDashboard(dash);
        setPlans(portalPlans);
      })
      .catch(() => {
        router.replace("/login");
      })
      .finally(() => setLoading(false));
  }, [router]);

  const freePlan = useMemo(
    () => dashboard?.plan || plans.find((plan) => plan.code === "free") || null,
    [dashboard, plans],
  );

  if (loading) {
    return <div className="grid min-h-screen place-items-center text-muted-foreground">Loading developer portal...</div>;
  }

  if (!dashboard) return null;

  const handleCreateKey = async () => {
    setCreating(true);
    try {
      const created = await createPortalApiKey(keyLabel);
      setLatestSecret(created.plaintext_key);
      setDashboard((current) =>
        current
          ? { ...current, api_keys: [created, ...current.api_keys] }
          : current,
      );
      toast.success("API key created");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to create key.");
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id: string) => {
    try {
      await revokePortalApiKey(id);
      setDashboard((current) =>
        current
          ? {
              ...current,
              api_keys: current.api_keys.map((key) =>
                key.id === id ? { ...key, active: false } : key,
              ),
            }
          : current,
      );
      toast.success("API key revoked");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to revoke key.");
    }
  };

  const handleLogout = async () => {
    await logoutPortalAccount();
    router.replace("/login");
  };

  const copySecret = async () => {
    if (!latestSecret) return;
    await navigator.clipboard.writeText(latestSecret);
    toast.success("API key copied");
  };

  return (
    <main className="min-h-screen bg-background">
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-muted-foreground">GeoAtlas commercial API</p>
            <h1 className="text-4xl font-bold tracking-tight">Developer dashboard</h1>
            <p className="mt-2 text-muted-foreground">
              Create keys, track free-tier access, and manage your organization&apos;s API account.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {dashboard.hidden_admin_slug ? (
              <Button asChild variant="outline">
                <Link href={`/backoffice/${dashboard.hidden_admin_slug}`}>Hidden admin</Link>
              </Button>
            ) : null}
            <Button variant="outline" onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <StatCard label="Plan" value={freePlan?.name || "Free"} hint={`INR ${freePlan?.monthly_price_inr ?? 0}/month`} />
          <StatCard label="RPM limit" value={String(freePlan?.requests_per_minute ?? 0)} hint="Requests per minute" />
          <StatCard label="Monthly quota" value={String(freePlan?.monthly_request_limit ?? 0)} hint="Requests this month" />
          <StatCard label="Active keys" value={String(dashboard.api_keys.filter((key) => key.active).length)} hint={`Max ${freePlan?.max_api_keys ?? 0}`} />
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.4fr_0.9fr]">
          <Card>
            <CardHeader>
              <CardTitle>API keys</CardTitle>
              <CardDescription>Create and revoke credentials for the free tier.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-3 md:flex-row">
                <Input value={keyLabel} onChange={(event) => setKeyLabel(event.target.value)} placeholder="Key label" />
                <Button onClick={handleCreateKey} disabled={creating}>
                  <Plus className="mr-2 h-4 w-4" />
                  Generate key
                </Button>
              </div>
              {latestSecret ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-amber-900">Copy this key now</p>
                      <p className="text-amber-800/80">It is only shown once.</p>
                    </div>
                    <Button size="sm" variant="outline" onClick={copySecret}>
                      <Copy className="mr-2 h-4 w-4" />
                      Copy
                    </Button>
                  </div>
                  <code className="mt-3 block overflow-x-auto rounded-xl bg-white p-3 text-xs text-amber-900">
                    {latestSecret}
                  </code>
                </div>
              ) : null}
              <div className="space-y-3">
                {dashboard.api_keys.map((key) => (
                  <div key={key.id} className="flex flex-col gap-3 rounded-2xl border p-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <KeyRound className="h-4 w-4 text-primary" />
                        <strong>{key.label}</strong>
                        <span className={`rounded-full px-2 py-0.5 text-xs ${key.active ? "bg-emerald-100 text-emerald-800" : "bg-zinc-200 text-zinc-700"}`}>
                          {key.active ? "Active" : "Revoked"}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {key.key_prefix}•••• • {key.monthly_request_count}/{key.monthly_request_limit} used this month
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{key.requests_per_minute} RPM</span>
                      {key.active ? (
                        <Button size="sm" variant="outline" onClick={() => void handleRevoke(key.id)}>
                          Revoke
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))}
                {!dashboard.api_keys.length ? (
                  <p className="text-sm text-muted-foreground">No API keys created yet.</p>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Account</CardTitle>
                <CardDescription>Your commercial API customer identity.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <InfoRow label="Name" value={dashboard.user.full_name} />
                <InfoRow label="Email" value={dashboard.user.email} />
                <InfoRow label="Organization" value={dashboard.user.organization || "Independent"} />
                <InfoRow label="Billing status" value={dashboard.user.billing_status} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Billing</CardTitle>
                <CardDescription>Free tier today, expandable for paid plans later.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="rounded-2xl border bg-muted/40 p-4">
                  <div className="flex items-center gap-2 font-medium">
                    <Sparkles className="h-4 w-4 text-primary" />
                    {freePlan?.name || "Free"} tier active
                  </div>
                  <p className="mt-2 text-muted-foreground">
                    INR {freePlan?.monthly_price_inr ?? 0}/month • {freePlan?.requests_per_minute ?? 0} RPM • {freePlan?.monthly_request_limit ?? 0} monthly requests
                  </p>
                </div>
                {dashboard.invoices.map((invoice) => (
                  <div key={invoice.id} className="rounded-2xl border p-4">
                    <div className="flex items-center justify-between gap-3">
                      <strong>{invoice.plan_code.toUpperCase()}</strong>
                      <span className="text-xs uppercase tracking-wide text-muted-foreground">{invoice.status}</span>
                    </div>
                    <p className="mt-1 text-muted-foreground">INR {invoice.amount_inr} {invoice.currency}</p>
                    {invoice.notes ? <p className="mt-2 text-xs text-muted-foreground">{invoice.notes}</p> : null}
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Integration</CardTitle>
                <CardDescription>Use your generated key against the public API.</CardDescription>
              </CardHeader>
              <CardContent>
                <code className="block rounded-2xl bg-muted p-4 text-xs">
                  {`curl -H "X-API-Key: YOUR_KEY" http://127.0.0.1:8000/api/v1/public/items`}
                </code>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
    </main>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card>
      <CardContent className="space-y-2 p-5">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <p className="text-3xl font-bold tracking-tight">{value}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
