"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  createPortalAdminInvoice,
  createPortalAdminPlan,
  fetchPortalAdminApiKeys,
  fetchPortalAdminInvoices,
  fetchPortalAdminOverview,
  fetchPortalAdminPlans,
  fetchPortalAdminUsers,
  fetchPortalDashboard,
  updatePortalAdminPlan,
  updatePortalAdminUser,
  type PortalAdminOverview,
  type PortalApiKey,
  type PortalInvoice,
  type PortalPlan,
  type PortalUser,
} from "@/lib/portal-api";

export function AdminPortal({ slug }: { slug: string }) {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [overview, setOverview] = useState<PortalAdminOverview | null>(null);
  const [users, setUsers] = useState<PortalUser[]>([]);
  const [plans, setPlans] = useState<PortalPlan[]>([]);
  const [apiKeys, setApiKeys] = useState<PortalApiKey[]>([]);
  const [invoices, setInvoices] = useState<PortalInvoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetchPortalDashboard(), fetchPortalAdminOverview(), fetchPortalAdminUsers(), fetchPortalAdminPlans(), fetchPortalAdminApiKeys(), fetchPortalAdminInvoices()])
      .then(([dashboard, nextOverview, nextUsers, nextPlans, nextApiKeys, nextInvoices]) => {
        if (!dashboard.hidden_admin_slug || dashboard.hidden_admin_slug !== slug) {
          router.replace("/portal");
          return;
        }
        setAuthorized(true);
        setOverview(nextOverview);
        setUsers(nextUsers);
        setPlans(nextPlans);
        setApiKeys(nextApiKeys);
        setInvoices(nextInvoices);
      })
      .catch(() => {
        router.replace("/login");
      })
      .finally(() => setLoading(false));
  }, [router, slug]);

  if (loading) {
    return <div className="min-h-screen grid place-items-center text-muted-foreground">Loading backoffice…</div>;
  }
  if (!authorized || !overview) return null;

  return (
    <main className="min-h-screen bg-background">
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-muted-foreground">Hidden admin route</p>
          <h1 className="text-4xl font-bold tracking-tight">Commercial API backoffice</h1>
          <p className="mt-2 text-muted-foreground">Customers, tiers, pricing, rate limits, API credentials, and billing operations.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Metric title="Users" value={overview.total_users} />
          <Metric title="Active keys" value={overview.active_api_keys} />
          <Metric title="Monthly requests" value={overview.monthly_requests} />
          <Metric title="Revenue (INR)" value={overview.monthly_revenue_inr} />
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <Card>
            <CardHeader>
              <CardTitle>Registered users</CardTitle>
              <CardDescription>Update plan assignment, access status, and billing state.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {users.map((user) => (
                <UserAdminCard key={user.id} user={user} plans={plans} onSave={async (next) => {
                  const saved = await updatePortalAdminUser(user.id, next);
                  setUsers((current) => current.map((entry) => entry.id === saved.id ? saved : entry));
                  toast.success("User updated");
                }} />
              ))}
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Plans & pricing</CardTitle>
                <CardDescription>Only the free tier is active today, but future tiers can be managed here.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {plans.map((plan) => (
                  <PlanEditor key={plan.id} plan={plan} onSave={async (next) => {
                    const saved = await updatePortalAdminPlan(plan.id, next);
                    setPlans((current) => current.map((entry) => entry.id === saved.id ? saved : entry));
                    toast.success("Plan updated");
                  }} />
                ))}
                <PlanCreator onCreate={async (payload) => {
                  const created = await createPortalAdminPlan(payload);
                  setPlans((current) => [...current, created]);
                  toast.success("Plan created");
                }} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Billing</CardTitle>
                <CardDescription>Issue invoices or account notes for commercial customers.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <InvoiceCreator users={users} onCreate={async (payload) => {
                  const created = await createPortalAdminInvoice(payload);
                  setInvoices((current) => [created, ...current]);
                  toast.success("Invoice created");
                }} />
                {invoices.slice(0, 8).map((invoice) => (
                  <div key={invoice.id} className="rounded-2xl border p-4 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <strong>{invoice.plan_code.toUpperCase()}</strong>
                      <span className="text-xs uppercase tracking-wide text-muted-foreground">{invoice.status}</span>
                    </div>
                    <p className="mt-1 text-muted-foreground">₹{invoice.amount_inr} • {invoice.currency}</p>
                    {invoice.notes ? <p className="mt-2 text-xs text-muted-foreground">{invoice.notes}</p> : null}
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Issued API keys</CardTitle>
                <CardDescription>Visibility into customer key lifecycle and quota usage.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {apiKeys.slice(0, 10).map((key) => (
                  <div key={key.id} className="rounded-2xl border p-4 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <strong>{key.label}</strong>
                      <span className="text-xs text-muted-foreground">{key.key_prefix}••••</span>
                    </div>
                    <p className="mt-1 text-muted-foreground">
                      {key.monthly_request_count}/{key.monthly_request_limit} this month • {key.requests_per_minute} RPM
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
    </main>
  );
}

function Metric({ title, value }: { title: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-sm text-muted-foreground">{title}</p>
        <p className="mt-2 text-3xl font-bold tracking-tight">{value}</p>
      </CardContent>
    </Card>
  );
}

function UserAdminCard({
  user,
  plans,
  onSave,
}: {
  user: PortalUser;
  plans: PortalPlan[];
  onSave: (payload: { plan_id?: string | null; billing_status: string; active: boolean; is_admin: boolean }) => Promise<void>;
}) {
  const [billingStatus, setBillingStatus] = useState(user.billing_status);
  const [planId, setPlanId] = useState(user.plan?.id || "");
  const [active, setActive] = useState(user.active);
  const [isAdmin, setIsAdmin] = useState(user.is_admin);

  return (
    <div className="rounded-2xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <strong>{user.full_name}</strong>
          <p className="text-sm text-muted-foreground">{user.email} • {user.organization || "Independent"}</p>
        </div>
        <Button size="sm" onClick={() => void onSave({ plan_id: planId || null, billing_status: billingStatus, active, is_admin: isAdmin })}>
          Save
        </Button>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <Input value={billingStatus} onChange={(event) => setBillingStatus(event.target.value)} placeholder="Billing status" />
        <select className="rounded-md border bg-background px-3 py-2 text-sm" value={planId} onChange={(event) => setPlanId(event.target.value)}>
          <option value="">No plan</option>
          {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
        </select>
        <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
          <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
          Active
        </label>
        <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
          <input type="checkbox" checked={isAdmin} onChange={(event) => setIsAdmin(event.target.checked)} />
          Admin
        </label>
      </div>
    </div>
  );
}

function PlanEditor({
  plan,
  onSave,
}: {
  plan: PortalPlan;
  onSave: (payload: Omit<PortalPlan, "id">) => Promise<void>;
}) {
  const [state, setState] = useState<Omit<PortalPlan, "id">>({
    code: plan.code,
    name: plan.name,
    description: plan.description,
    monthly_price_inr: plan.monthly_price_inr,
    requests_per_minute: plan.requests_per_minute,
    monthly_request_limit: plan.monthly_request_limit,
    max_api_keys: plan.max_api_keys,
    active: plan.active,
    public_visible: plan.public_visible,
  });

  return (
    <div className="rounded-2xl border p-4">
      <div className="grid gap-3 md:grid-cols-2">
        <Input value={state.name} onChange={(event) => setState({ ...state, name: event.target.value })} placeholder="Plan name" />
        <Input value={state.code} onChange={(event) => setState({ ...state, code: event.target.value })} placeholder="Code" />
        <Input value={String(state.monthly_price_inr)} onChange={(event) => setState({ ...state, monthly_price_inr: Number(event.target.value || 0) })} placeholder="Monthly INR" />
        <Input value={String(state.requests_per_minute)} onChange={(event) => setState({ ...state, requests_per_minute: Number(event.target.value || 0) })} placeholder="RPM" />
        <Input value={String(state.monthly_request_limit)} onChange={(event) => setState({ ...state, monthly_request_limit: Number(event.target.value || 0) })} placeholder="Monthly limit" />
        <Input value={String(state.max_api_keys)} onChange={(event) => setState({ ...state, max_api_keys: Number(event.target.value || 0) })} placeholder="Max keys" />
      </div>
      <Input className="mt-3" value={state.description || ""} onChange={(event) => setState({ ...state, description: event.target.value })} placeholder="Description" />
      <div className="mt-3 flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={state.active} onChange={(event) => setState({ ...state, active: event.target.checked })} /> Active</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={state.public_visible} onChange={(event) => setState({ ...state, public_visible: event.target.checked })} /> Public</label>
      </div>
      <Button className="mt-3" size="sm" onClick={() => void onSave(state)}>Save plan</Button>
    </div>
  );
}

function PlanCreator({ onCreate }: { onCreate: (payload: Omit<PortalPlan, "id">) => Promise<void> }) {
  const [state, setState] = useState<Omit<PortalPlan, "id">>({
    code: "",
    name: "",
    description: "",
    monthly_price_inr: 0,
    requests_per_minute: 60,
    monthly_request_limit: 10000,
    max_api_keys: 2,
    active: true,
    public_visible: false,
  });

  return (
    <div className="rounded-2xl border border-dashed p-4">
      <p className="mb-3 text-sm font-medium">Create future tier</p>
      <div className="grid gap-3 md:grid-cols-2">
        <Input value={state.name} onChange={(event) => setState({ ...state, name: event.target.value })} placeholder="Plan name" />
        <Input value={state.code} onChange={(event) => setState({ ...state, code: event.target.value })} placeholder="Code" />
      </div>
      <Button className="mt-3" size="sm" variant="outline" onClick={() => void onCreate(state)}>Add plan</Button>
    </div>
  );
}

function InvoiceCreator({
  users,
  onCreate,
}: {
  users: PortalUser[];
  onCreate: (payload: { user_id: string; amount_inr: number; status: string; plan_code: string; notes?: string | null }) => Promise<void>;
}) {
  const [userId, setUserId] = useState("");
  const [amount, setAmount] = useState("0");
  const [status, setStatus] = useState("free");
  const [planCode, setPlanCode] = useState("free");
  const [notes, setNotes] = useState("");

  return (
    <div className="rounded-2xl border border-dashed p-4">
      <p className="mb-3 text-sm font-medium">Create invoice entry</p>
      <div className="grid gap-3 md:grid-cols-2">
        <select className="rounded-md border bg-background px-3 py-2 text-sm" value={userId} onChange={(event) => setUserId(event.target.value)}>
          <option value="">Select user</option>
          {users.map((user) => <option key={user.id} value={user.id}>{user.full_name}</option>)}
        </select>
        <Input value={planCode} onChange={(event) => setPlanCode(event.target.value)} placeholder="Plan code" />
        <Input value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Amount INR" />
        <Input value={status} onChange={(event) => setStatus(event.target.value)} placeholder="Status" />
      </div>
      <Input className="mt-3" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Notes" />
      <Button className="mt-3" size="sm" variant="outline" onClick={() => void onCreate({ user_id: userId, amount_inr: Number(amount || 0), status, plan_code: planCode, notes })}>
        Create invoice
      </Button>
    </div>
  );
}
