"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { PortalShell } from "@/components/marketing";
import {
  portalApi,
  PortalAdminOverview,
  PortalApiKey,
  PortalInvoice,
  PortalPlan,
  PortalUser,
} from "@/lib/api";

type AdminView = "users" | "plans" | "invoices" | "keys";

const USERS_PER_PAGE = 10;

const emptyPlan: Omit<PortalPlan, "id"> = {
  code: "",
  name: "",
  description: "",
  monthly_price_inr: 0,
  requests_per_minute: 60,
  monthly_request_limit: 10000,
  max_api_keys: 2,
  active: true,
  public_visible: false,
};

const emptyInvoice = {
  user_id: "",
  plan_code: "",
  amount_inr: 0,
  status: "open",
  notes: "",
};

function planCodeFromName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

function inr(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function dateLabel(value: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function BackofficePage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const slug = typeof params.slug === "string" ? params.slug : "";
  const [overview, setOverview] = useState<PortalAdminOverview | null>(null);
  const [users, setUsers] = useState<PortalUser[]>([]);
  const [plans, setPlans] = useState<PortalPlan[]>([]);
  const [keys, setKeys] = useState<PortalApiKey[]>([]);
  const [invoices, setInvoices] = useState<PortalInvoice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [newPlan, setNewPlan] = useState<Omit<PortalPlan, "id">>(emptyPlan);
  const [invoiceState, setInvoiceState] = useState(emptyInvoice);
  const [planBusy, setPlanBusy] = useState(false);
  const [invoiceBusy, setInvoiceBusy] = useState(false);
  const [userAction, setUserAction] = useState<string | null>(null);
  const [editingPlan, setEditingPlan] = useState<PortalPlan | null>(null);
  const [planEditBusy, setPlanEditBusy] = useState(false);
  const [confirmDeletePlanId, setConfirmDeletePlanId] = useState<string | null>(null);
  const [deletingPlanId, setDeletingPlanId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<AdminView>("users");
  const [userQuery, setUserQuery] = useState("");
  const [userStatus, setUserStatus] = useState<"all" | "active" | "disabled">("all");
  const [userPage, setUserPage] = useState(1);
  const [invoiceUserQuery, setInvoiceUserQuery] = useState("");

  const usersById = useMemo(
    () => new Map(users.map((user) => [user.id, user])),
    [users],
  );

  const selectedInvoicePlan = plans.find((plan) => plan.code === invoiceState.plan_code);
  const selectedInvoiceUser = usersById.get(invoiceState.user_id);
  const filteredUsers = useMemo(() => {
    const query = userQuery.trim().toLowerCase();
    return users.filter((user) => {
      const matchesQuery = !query || [user.full_name, user.email, user.organization ?? "", user.plan?.name ?? ""]
        .some((value) => value.toLowerCase().includes(query));
      const matchesStatus =
        userStatus === "all" ||
        (userStatus === "active" ? user.active : !user.active);
      return matchesQuery && matchesStatus;
    });
  }, [userQuery, userStatus, users]);
  const userPageCount = Math.max(1, Math.ceil(filteredUsers.length / USERS_PER_PAGE));
  const visibleUsers = filteredUsers.slice(
    (userPage - 1) * USERS_PER_PAGE,
    userPage * USERS_PER_PAGE,
  );
  const invoiceUserOptions = useMemo(() => {
    const query = invoiceUserQuery.trim().toLowerCase();
    const matches = users.filter((user) => (
      !query || [user.full_name, user.email, user.organization ?? ""]
        .some((value) => value.toLowerCase().includes(query))
    ));
    const limited = matches.slice(0, 100);
    const selected = users.find((user) => user.id === invoiceState.user_id);
    return selected && !limited.some((user) => user.id === selected.id)
      ? [selected, ...limited]
      : limited;
  }, [invoiceState.user_id, invoiceUserQuery, users]);

  useEffect(() => {
    setUserPage(1);
  }, [userQuery, userStatus]);

  useEffect(() => {
    setUserPage((current) => Math.min(current, userPageCount));
  }, [userPageCount]);

  useEffect(() => {
    if (!slug) return;
    (async () => {
      try {
        const [me, ov, userRows, planRows, keyRows, invoiceRows] = await Promise.all([
          portalApi.me(),
          portalApi.adminOverview(),
          portalApi.adminUsers(),
          portalApi.adminPlans(),
          portalApi.adminApiKeys(),
          portalApi.adminInvoices(),
        ]);
        if (me.hidden_admin_slug !== slug) {
          router.replace("/portal");
          return;
        }
        setOverview(ov);
        setUsers(userRows);
        setPlans(planRows);
        setKeys(keyRows);
        setInvoices(invoiceRows);
        const defaultPlan = planRows.find((plan) => plan.code === "free") ?? planRows[0];
        if (defaultPlan) {
          setInvoiceState((current) => ({
            ...current,
            plan_code: defaultPlan.code,
            amount_inr: defaultPlan.monthly_price_inr,
          }));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unable to load admin backoffice.";
        if (message === "Authentication required.") {
          router.replace(`/login?next=${encodeURIComponent(`/backoffice/${slug}`)}`);
          return;
        }
        setError(message);
      }
    })();
  }, [slug, router]);

  const refresh = async () => {
    const [ov, userRows, planRows, keyRows, invoiceRows] = await Promise.all([
      portalApi.adminOverview(),
      portalApi.adminUsers(),
      portalApi.adminPlans(),
      portalApi.adminApiKeys(),
      portalApi.adminInvoices(),
    ]);
    setOverview(ov);
    setUsers(userRows);
    setPlans(planRows);
    setKeys(keyRows);
    setInvoices(invoiceRows);
  };

  const createPlan = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    const code = newPlan.code.trim().toLowerCase();
    if (!newPlan.name.trim() || !code) {
      setError("Enter both a customer-facing plan name and an internal plan code.");
      return;
    }
    if (!/^[a-z0-9][a-z0-9-]{1,31}$/.test(code)) {
      setError("Plan code must be 2–32 lowercase letters, numbers, or hyphens.");
      return;
    }
    setPlanBusy(true);
    try {
      await portalApi.adminCreatePlan({ ...newPlan, code, name: newPlan.name.trim() });
      setNewPlan(emptyPlan);
      setNotice(`${newPlan.name.trim()} was created successfully.`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create the plan.");
    } finally {
      setPlanBusy(false);
    }
  };

  const createInvoice = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    if (!invoiceState.user_id) {
      setError("Select the customer who should receive this invoice.");
      return;
    }
    if (!invoiceState.plan_code) {
      setError("Select the plan this invoice is for.");
      return;
    }
    setInvoiceBusy(true);
    try {
      await portalApi.adminCreateInvoice(invoiceState);
      setNotice(`Invoice created for ${selectedInvoiceUser?.full_name ?? "the selected customer"}.`);
      setInvoiceState({
        ...emptyInvoice,
        plan_code: selectedInvoicePlan?.code ?? plans[0]?.code ?? "",
        amount_inr: selectedInvoicePlan?.monthly_price_inr ?? 0,
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create the invoice.");
    } finally {
      setInvoiceBusy(false);
    }
  };

  const updatePlan = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingPlan) return;
    setError(null);
    setNotice(null);
    setPlanEditBusy(true);
    try {
      const { id, ...payload } = editingPlan;
      await portalApi.adminUpdatePlan(id, {
        ...payload,
        code: planCodeFromName(payload.code),
        name: payload.name.trim(),
      });
      setNotice(`${payload.name.trim()} was updated.`);
      setEditingPlan(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update the plan.");
    } finally {
      setPlanEditBusy(false);
    }
  };

  const deletePlan = async (plan: PortalPlan) => {
    setError(null);
    setNotice(null);
    setDeletingPlanId(plan.id);
    try {
      await portalApi.adminDeletePlan(plan.id);
      setNotice(`${plan.name} was deleted.`);
      setConfirmDeletePlanId(null);
      if (editingPlan?.id === plan.id) setEditingPlan(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete the plan.");
    } finally {
      setDeletingPlanId(null);
    }
  };

  const updateUser = async (
    user: PortalUser,
    action: string,
    payload: Record<string, unknown>,
    successMessage: string,
  ) => {
    setError(null);
    setNotice(null);
    setUserAction(`${user.id}:${action}`);
    try {
      await portalApi.adminUpdateUser(user.id, payload);
      setNotice(successMessage);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update the customer.");
    } finally {
      setUserAction(null);
    }
  };

  if (!overview) {
    return (
      <PortalShell active="admin">
        <div className="portal-center"><div className="portal-card pad">{error || "Loading backoffice..."}</div></div>
      </PortalShell>
    );
  }

  return (
    <PortalShell active="admin">
      <div className="portal-shell">
        <div className="portal-container">
          <div className="portal-topbar">
            <div className="portal-brand">
              <span className="portal-kicker">Administration</span>
              <h1 className="portal-title">Commercial API backoffice</h1>
              <p className="portal-subtitle">Manage customers, plans, access limits, API keys, and billing records.</p>
            </div>
          </div>

          {error ? <div className="portal-banner" role="alert">{error}</div> : null}
          {notice ? <div className="portal-banner portal-success" role="status">{notice}</div> : null}

          <div className="portal-grid stats">
            <section className="portal-card pad portal-stat"><span className="portal-kicker">Registered users</span><strong>{overview.total_users}</strong></section>
            <section className="portal-card pad portal-stat"><span className="portal-kicker">Active users</span><strong>{overview.active_users}</strong></section>
            <section className="portal-card pad portal-stat"><span className="portal-kicker">Active API keys</span><strong>{overview.active_api_keys}/{overview.total_api_keys}</strong></section>
            <section className="portal-card pad portal-stat"><span className="portal-kicker">Recorded revenue</span><strong>{inr(overview.monthly_revenue_inr)}</strong></section>
          </div>

          <nav className="portal-admin-tabs" aria-label="Backoffice sections">
            {([
              ["users", "Users", overview.total_users],
              ["plans", "Plans", plans.length],
              ["invoices", "Invoices", invoices.length],
              ["keys", "API keys", overview.total_api_keys],
            ] as const).map(([view, label, count]) => (
              <button
                type="button"
                className={activeView === view ? "active" : ""}
                aria-current={activeView === view ? "page" : undefined}
                onClick={() => setActiveView(view)}
                key={view}
              >
                <span>{label}</span>
                <strong>{count}</strong>
              </button>
            ))}
          </nav>

          <div className="portal-admin-stack">
            {activeView === "users" ? (
            <section className="portal-card pad">
              <div className="portal-section-heading">
                <div><span className="portal-kicker">Customer management</span><h2>Registered users</h2></div>
                <p>Change a customer’s plan or account access without editing database IDs.</p>
              </div>
              <div className="portal-admin-toolbar">
                <div className="portal-field">
                  <label htmlFor="user-search">Search users</label>
                  <input
                    id="user-search"
                    type="search"
                    className="portal-input"
                    value={userQuery}
                    onChange={(event) => setUserQuery(event.target.value)}
                    placeholder="Name, email, organization, or plan"
                  />
                </div>
                <div className="portal-field">
                  <label htmlFor="user-status">Account status</label>
                  <select id="user-status" className="portal-select" value={userStatus} onChange={(event) => setUserStatus(event.target.value as typeof userStatus)}>
                    <option value="all">All accounts</option>
                    <option value="active">Active only</option>
                    <option value="disabled">Disabled only</option>
                  </select>
                </div>
                <p><strong>{filteredUsers.length}</strong> matching {filteredUsers.length === 1 ? "user" : "users"}</p>
              </div>
              <div className="portal-list">
                {visibleUsers.map((user) => (
                  <div className="portal-user-row" key={user.id}>
                    <div className="portal-user-identity">
                      <span className="commercial-avatar">{user.full_name.slice(0, 2).toUpperCase()}</span>
                      <div>
                        <strong>{user.full_name}</strong>
                        <div className="portal-muted">{user.email}</div>
                        <div className="portal-inline-tags">
                          <span className={`portal-tag ${user.active ? "success" : "danger"}`}>{user.active ? "Active" : "Disabled"}</span>
                          {user.is_admin ? <span className="portal-tag warning">Administrator</span> : null}
                          <span className="portal-tag">{user.billing_status}</span>
                        </div>
                      </div>
                    </div>
                    <div className="portal-user-controls">
                      <div className="portal-field compact">
                        <label htmlFor={`plan-${user.id}`}>Assigned plan</label>
                        <select
                          id={`plan-${user.id}`}
                          className="portal-select"
                          value={user.plan?.id ?? ""}
                          disabled={userAction !== null}
                          onChange={(event) => void updateUser(
                            user,
                            "plan",
                            { plan_id: event.target.value },
                            `${user.full_name} is now on ${plans.find((plan) => plan.id === event.target.value)?.name ?? "the selected plan"}.`,
                          )}
                        >
                          <option value="" disabled>Select a plan</option>
                          {plans.filter((plan) => plan.active).map((plan) => (
                            <option value={plan.id} key={plan.id}>{plan.name} — {inr(plan.monthly_price_inr)}/month</option>
                          ))}
                        </select>
                      </div>
                      <div className="portal-inline">
                        <button
                          className="portal-button"
                          disabled={userAction !== null}
                          onClick={() => void updateUser(
                            user,
                            "active",
                            { active: !user.active },
                            `${user.full_name} was ${user.active ? "disabled" : "enabled"}.`,
                          )}
                        >
                          {userAction === `${user.id}:active` ? "Saving..." : user.active ? "Disable account" : "Enable account"}
                        </button>
                        <button
                          className="portal-button"
                          disabled={userAction !== null}
                          onClick={() => void updateUser(
                            user,
                            "admin",
                            { is_admin: !user.is_admin },
                            `${user.full_name} ${user.is_admin ? "no longer has" : "now has"} administrator access.`,
                          )}
                        >
                          {userAction === `${user.id}:admin` ? "Saving..." : user.is_admin ? "Remove admin access" : "Grant admin access"}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {!visibleUsers.length ? <div className="portal-empty-state"><strong>No users found</strong><p>Try another search term or account-status filter.</p></div> : null}
              </div>
              {userPageCount > 1 ? (
                <div className="portal-pagination">
                  <button type="button" className="portal-button" disabled={userPage === 1} onClick={() => setUserPage((page) => page - 1)}>Previous</button>
                  <span>Page <strong>{userPage}</strong> of {userPageCount}</span>
                  <button type="button" className="portal-button" disabled={userPage === userPageCount} onClick={() => setUserPage((page) => page + 1)}>Next</button>
                </div>
              ) : null}
            </section>
            ) : null}

            {activeView === "plans" ? (
              <section className="portal-card pad">
                <div className="portal-section-heading">
                  <div><span className="portal-kicker">Product catalogue</span><h2>Plans and pricing</h2></div>
                  <p>These values control the limits applied to every API key created under a plan.</p>
                </div>
                <div className="portal-list portal-plan-list">
                  {plans.map((plan) => {
                    const assignedCount = users.filter((user) => user.plan?.id === plan.id).length;
                    const isEditing = editingPlan?.id === plan.id;
                    const deleteBlocked = plan.code === "free" || assignedCount > 0;
                    return (
                      <div className="portal-plan-admin-item" key={plan.id}>
                        <article className="portal-plan-summary">
                          <div>
                            <strong>{plan.name}</strong>
                            <span>{plan.code}</span>
                          </div>
                          <strong>{inr(plan.monthly_price_inr)}<small>/month</small></strong>
                          <p>{plan.description || "No description has been added."}</p>
                          <div className="portal-inline-tags">
                            <span className={`portal-tag ${plan.active ? "success" : "danger"}`}>{plan.active ? "Active" : "Inactive"}</span>
                            <span className="portal-tag">{plan.public_visible ? "Shown publicly" : "Hidden from pricing"}</span>
                            <span className="portal-tag">{plan.requests_per_minute} requests/min</span>
                            <span className="portal-tag">{plan.monthly_request_limit.toLocaleString("en-IN")} requests/month</span>
                            <span className="portal-tag">{plan.max_api_keys} keys</span>
                            <span className="portal-tag">{assignedCount} assigned {assignedCount === 1 ? "user" : "users"}</span>
                          </div>
                          <div className="portal-plan-actions">
                            <button
                              type="button"
                              className="portal-button"
                              onClick={() => {
                                setEditingPlan({ ...plan });
                                setConfirmDeletePlanId(null);
                              }}
                            >
                              Edit plan
                            </button>
                            <button
                              type="button"
                              className="portal-button danger"
                              disabled={deleteBlocked}
                              title={
                                plan.code === "free"
                                  ? "The system Free plan cannot be deleted."
                                  : assignedCount
                                    ? `Reassign ${assignedCount} user(s) before deleting.`
                                    : "Delete this plan"
                              }
                              onClick={() => setConfirmDeletePlanId(plan.id)}
                            >
                              Delete plan
                            </button>
                          </div>
                        </article>

                        {deleteBlocked ? (
                          <p className="portal-plan-protection">
                            {plan.code === "free"
                              ? "Protected system plan — it can be edited but not deleted."
                              : `Reassign ${assignedCount} user(s) before this plan can be deleted.`}
                          </p>
                        ) : null}

                        {confirmDeletePlanId === plan.id ? (
                          <div className="portal-delete-confirmation" role="alert">
                            <div><strong>Delete {plan.name} permanently?</strong><p>Historical invoices will remain, but this plan will no longer be available for assignment.</p></div>
                            <div className="portal-inline">
                              <button type="button" className="portal-button" onClick={() => setConfirmDeletePlanId(null)}>Cancel</button>
                              <button type="button" className="portal-button danger" disabled={deletingPlanId === plan.id} onClick={() => void deletePlan(plan)}>
                                {deletingPlanId === plan.id ? "Deleting..." : "Delete permanently"}
                              </button>
                            </div>
                          </div>
                        ) : null}

                        {isEditing && editingPlan ? (
                          <form className="portal-plan-edit-form" onSubmit={updatePlan}>
                            <div className="portal-form-heading">
                              <span className="portal-form-step">Editing</span>
                              <div><h3>Edit {plan.name}</h3><p>Saved changes apply to future keys and dashboard plan details.</p></div>
                            </div>
                            <div className="portal-form-section">
                              <div className="portal-form-grid two">
                                <div className="portal-field">
                                  <label htmlFor={`edit-name-${plan.id}`}>Plan name</label>
                                  <input id={`edit-name-${plan.id}`} className="portal-input" value={editingPlan.name} onChange={(event) => setEditingPlan({ ...editingPlan, name: event.target.value })} required />
                                </div>
                                <div className="portal-field">
                                  <label htmlFor={`edit-code-${plan.id}`}>Internal code</label>
                                  <input id={`edit-code-${plan.id}`} className="portal-input" value={editingPlan.code} onChange={(event) => setEditingPlan({ ...editingPlan, code: planCodeFromName(event.target.value) })} required />
                                </div>
                              </div>
                              <div className="portal-field">
                                <label htmlFor={`edit-description-${plan.id}`}>Customer description</label>
                                <textarea id={`edit-description-${plan.id}`} className="portal-textarea" value={editingPlan.description ?? ""} onChange={(event) => setEditingPlan({ ...editingPlan, description: event.target.value })} />
                              </div>
                              <div className="portal-form-grid four">
                                <div className="portal-field"><label htmlFor={`edit-price-${plan.id}`}>Monthly price (INR)</label><input id={`edit-price-${plan.id}`} className="portal-input" type="number" min="0" value={editingPlan.monthly_price_inr} onChange={(event) => setEditingPlan({ ...editingPlan, monthly_price_inr: Number(event.target.value) })} /></div>
                                <div className="portal-field"><label htmlFor={`edit-rpm-${plan.id}`}>Requests/minute</label><input id={`edit-rpm-${plan.id}`} className="portal-input" type="number" min="1" value={editingPlan.requests_per_minute} onChange={(event) => setEditingPlan({ ...editingPlan, requests_per_minute: Number(event.target.value) })} /></div>
                                <div className="portal-field"><label htmlFor={`edit-monthly-${plan.id}`}>Requests/month</label><input id={`edit-monthly-${plan.id}`} className="portal-input" type="number" min="1" value={editingPlan.monthly_request_limit} onChange={(event) => setEditingPlan({ ...editingPlan, monthly_request_limit: Number(event.target.value) })} /></div>
                                <div className="portal-field"><label htmlFor={`edit-keys-${plan.id}`}>Maximum keys</label><input id={`edit-keys-${plan.id}`} className="portal-input" type="number" min="1" value={editingPlan.max_api_keys} onChange={(event) => setEditingPlan({ ...editingPlan, max_api_keys: Number(event.target.value) })} /></div>
                              </div>
                              <div className="portal-form-grid two">
                                <label className="portal-choice"><input type="checkbox" checked={editingPlan.active} onChange={(event) => setEditingPlan({ ...editingPlan, active: event.target.checked })} /><span><strong>Active</strong><small>Allow assignment to customers.</small></span></label>
                                <label className="portal-choice"><input type="checkbox" checked={editingPlan.public_visible} onChange={(event) => setEditingPlan({ ...editingPlan, public_visible: event.target.checked })} /><span><strong>Publicly visible</strong><small>Show this plan on public pricing.</small></span></label>
                              </div>
                            </div>
                            <div className="portal-form-actions">
                              <button type="button" className="portal-button" onClick={() => setEditingPlan(null)}>Cancel</button>
                              <button type="submit" className="portal-button primary" disabled={planEditBusy}>{planEditBusy ? "Saving..." : "Save changes"}</button>
                            </div>
                          </form>
                        ) : null}
                      </div>
                    );
                  })}
                </div>

                <form className="portal-form portal-guided-form" onSubmit={createPlan}>
                  <div className="portal-form-heading">
                    <span className="portal-form-step">New plan</span>
                    <div><h3>Create a subscription plan</h3><p>Set the customer price and the exact API allowance included.</p></div>
                  </div>

                  <fieldset className="portal-form-section">
                    <legend>Plan identity</legend>
                    <div className="portal-form-grid two">
                      <div className="portal-field">
                        <label htmlFor="plan-name">Plan name <span>Required</span></label>
                        <input
                          id="plan-name"
                          className="portal-input"
                          value={newPlan.name}
                          onChange={(event) => {
                            const name = event.target.value;
                            setNewPlan((current) => ({
                              ...current,
                              name,
                              code: planCodeFromName(name),
                            }));
                          }}
                          placeholder="Example: Professional"
                          required
                        />
                        <small>Displayed to customers in their dashboard.</small>
                      </div>
                      <div className="portal-field">
                        <label htmlFor="plan-code">Internal code <span>Required</span></label>
                        <input
                          id="plan-code"
                          className="portal-input"
                          value={newPlan.code}
                          onChange={(event) => setNewPlan({ ...newPlan, code: planCodeFromName(event.target.value) })}
                          placeholder="professional"
                          required
                        />
                        <small>Lowercase identifier used in billing records; it cannot duplicate another plan.</small>
                      </div>
                    </div>
                    <div className="portal-field">
                      <label htmlFor="plan-description">Customer description</label>
                      <textarea
                        id="plan-description"
                        className="portal-textarea"
                        value={newPlan.description ?? ""}
                        onChange={(event) => setNewPlan({ ...newPlan, description: event.target.value })}
                        placeholder="Who this plan is for and what it includes."
                      />
                    </div>
                  </fieldset>

                  <fieldset className="portal-form-section">
                    <legend>Price and API limits</legend>
                    <div className="portal-form-grid two">
                      <div className="portal-field">
                        <label htmlFor="plan-price">Monthly price (INR)</label>
                        <input id="plan-price" className="portal-input" type="number" min="0" step="1" value={newPlan.monthly_price_inr} onChange={(event) => setNewPlan({ ...newPlan, monthly_price_inr: Number(event.target.value) })} />
                        <small>Use 0 for a free plan.</small>
                      </div>
                      <div className="portal-field">
                        <label htmlFor="plan-rpm">Requests per minute</label>
                        <input id="plan-rpm" className="portal-input" type="number" min="1" step="1" value={newPlan.requests_per_minute} onChange={(event) => setNewPlan({ ...newPlan, requests_per_minute: Number(event.target.value) })} />
                        <small>Short-term rate limit applied to each key.</small>
                      </div>
                      <div className="portal-field">
                        <label htmlFor="plan-monthly-limit">Requests per month</label>
                        <input id="plan-monthly-limit" className="portal-input" type="number" min="1" step="1" value={newPlan.monthly_request_limit} onChange={(event) => setNewPlan({ ...newPlan, monthly_request_limit: Number(event.target.value) })} />
                        <small>Total requests available during one UTC calendar month.</small>
                      </div>
                      <div className="portal-field">
                        <label htmlFor="plan-max-keys">Maximum active API keys</label>
                        <input id="plan-max-keys" className="portal-input" type="number" min="1" step="1" value={newPlan.max_api_keys} onChange={(event) => setNewPlan({ ...newPlan, max_api_keys: Number(event.target.value) })} />
                        <small>How many credentials one customer can keep active.</small>
                      </div>
                    </div>
                  </fieldset>

                  <fieldset className="portal-form-section">
                    <legend>Availability</legend>
                    <label className="portal-choice">
                      <input type="checkbox" checked={newPlan.active} onChange={(event) => setNewPlan({ ...newPlan, active: event.target.checked })} />
                      <span><strong>Allow plan assignment</strong><small>Administrators can assign this plan to customers.</small></span>
                    </label>
                    <label className="portal-choice">
                      <input type="checkbox" checked={newPlan.public_visible} onChange={(event) => setNewPlan({ ...newPlan, public_visible: event.target.checked })} />
                      <span><strong>Show on the public pricing page</strong><small>Leave off while testing or preparing an unpublished tier.</small></span>
                    </label>
                  </fieldset>

                  <div className="portal-form-actions">
                    <p>New keys created for this plan will immediately use these limits.</p>
                    <button className="portal-button primary" type="submit" disabled={planBusy}>
                      {planBusy ? "Creating plan..." : "Create plan"}
                    </button>
                  </div>
                </form>
              </section>
            ) : null}

            {activeView === "invoices" ? (
              <section className="portal-card pad">
                <div className="portal-section-heading">
                  <div><span className="portal-kicker">Billing records</span><h2>Invoices</h2></div>
                  <p>Create a clear billing entry using customer and plan names instead of database IDs.</p>
                </div>

                <form className="portal-form portal-guided-form" onSubmit={createInvoice}>
                  <div className="portal-form-heading">
                    <span className="portal-form-step">New invoice</span>
                    <div><h3>Record a customer invoice</h3><p>Choose the customer and plan, then confirm the amount and payment state.</p></div>
                  </div>

                  <fieldset className="portal-form-section">
                    <legend>Customer and plan</legend>
                    <div className="portal-field">
                      <label htmlFor="invoice-user-search">Find customer</label>
                      <input
                        id="invoice-user-search"
                        type="search"
                        className="portal-input"
                        value={invoiceUserQuery}
                        onChange={(event) => setInvoiceUserQuery(event.target.value)}
                        placeholder="Search by name, email, or organization"
                      />
                      <small>Search first when the customer list is large. Up to 100 matching results are shown.</small>
                    </div>
                    <div className="portal-field">
                      <label htmlFor="invoice-user">Customer <span>Required</span></label>
                      <select id="invoice-user" className="portal-select" value={invoiceState.user_id} onChange={(event) => setInvoiceState({ ...invoiceState, user_id: event.target.value })} required>
                        <option value="">Select a registered customer</option>
                        {invoiceUserOptions.map((user) => <option key={user.id} value={user.id}>{user.full_name} — {user.email}</option>)}
                      </select>
                      <small>The invoice will appear in this customer’s dashboard.</small>
                    </div>
                    <div className="portal-field">
                      <label htmlFor="invoice-plan">Plan <span>Required</span></label>
                      <select
                        id="invoice-plan"
                        className="portal-select"
                        value={invoiceState.plan_code}
                        onChange={(event) => {
                          const plan = plans.find((item) => item.code === event.target.value);
                          setInvoiceState({
                            ...invoiceState,
                            plan_code: event.target.value,
                            amount_inr: plan?.monthly_price_inr ?? invoiceState.amount_inr,
                          });
                        }}
                        required
                      >
                        <option value="">Select a plan</option>
                        {plans.map((plan) => <option key={plan.id} value={plan.code}>{plan.name} — {inr(plan.monthly_price_inr)}/month</option>)}
                      </select>
                      <small>Selecting a plan fills its current monthly price automatically.</small>
                    </div>
                  </fieldset>

                  <fieldset className="portal-form-section">
                    <legend>Amount and status</legend>
                    <div className="portal-form-grid two">
                      <div className="portal-field">
                        <label htmlFor="invoice-amount">Invoice amount (INR)</label>
                        <input id="invoice-amount" className="portal-input" type="number" min="0" step="1" value={invoiceState.amount_inr} onChange={(event) => setInvoiceState({ ...invoiceState, amount_inr: Number(event.target.value) })} />
                        <small>You can override the plan price for credits or negotiated billing.</small>
                      </div>
                      <div className="portal-field">
                        <label htmlFor="invoice-status">Payment status</label>
                        <select id="invoice-status" className="portal-select" value={invoiceState.status} onChange={(event) => setInvoiceState({ ...invoiceState, status: event.target.value })}>
                          <option value="open">Open — awaiting payment</option>
                          <option value="paid">Paid</option>
                          <option value="free">Free — no payment required</option>
                          <option value="overdue">Overdue</option>
                          <option value="void">Void / cancelled</option>
                        </select>
                      </div>
                    </div>
                    <div className="portal-field">
                      <label htmlFor="invoice-notes">Internal notes</label>
                      <textarea id="invoice-notes" className="portal-textarea" value={invoiceState.notes} onChange={(event) => setInvoiceState({ ...invoiceState, notes: event.target.value })} placeholder="Optional reference, billing period, or approval note." />
                      <small>Visible to administrators and included in the customer’s billing record.</small>
                    </div>
                  </fieldset>

                  <div className="portal-invoice-preview">
                    <span>Invoice preview</span>
                    <strong>{selectedInvoiceUser?.full_name ?? "No customer selected"}</strong>
                    <p>{selectedInvoicePlan?.name ?? "No plan selected"} · {inr(invoiceState.amount_inr)} · {invoiceState.status}</p>
                  </div>

                  <div className="portal-form-actions">
                    <p>Review the preview before saving. This creates a billing record; it does not charge a card.</p>
                    <button className="portal-button primary" type="submit" disabled={invoiceBusy}>
                      {invoiceBusy ? "Creating invoice..." : "Create invoice record"}
                    </button>
                  </div>
                </form>

                <div className="portal-record-list">
                  <h3>Recent invoices</h3>
                  {invoices.length ? invoices.map((invoice) => {
                    const user = usersById.get(invoice.user_id);
                    return (
                      <article className="portal-invoice-row" key={invoice.id}>
                        <div>
                          <strong>{user?.full_name ?? "Unknown customer"}</strong>
                          <span>{user?.email ?? invoice.user_id}</span>
                        </div>
                        <div><strong>{inr(invoice.amount_inr)}</strong><span>{invoice.plan_code.toUpperCase()} · {dateLabel(invoice.issued_at)}</span></div>
                        <span className={`portal-tag ${invoice.status === "paid" || invoice.status === "free" ? "success" : invoice.status === "overdue" ? "danger" : ""}`}>{invoice.status}</span>
                      </article>
                    );
                  }) : <p className="portal-muted">No invoice records yet.</p>}
                </div>
              </section>
            ) : null}

            {activeView === "keys" ? (
            <section className="portal-card pad">
              <div className="portal-section-heading">
                <div><span className="portal-kicker">Credential activity</span><h2>Issued API keys</h2></div>
                <p>Only key prefixes are shown. Full credentials are displayed once to customers when generated.</p>
              </div>
              <div className="portal-list">
                {keys.length ? keys.map((key) => (
                  <div className="portal-row" key={key.id}>
                    <div><strong>{key.label}</strong><div className="portal-muted"><code>{key.key_prefix}••••</code></div></div>
                    <div className="portal-key-usage">
                      <span className={`portal-tag ${key.active ? "success" : "danger"}`}>{key.active ? "Active" : "Revoked"}</span>
                      <span>{key.monthly_request_count.toLocaleString("en-IN")} / {key.monthly_request_limit.toLocaleString("en-IN")} requests used</span>
                    </div>
                  </div>
                )) : <p className="portal-muted">No API keys have been issued.</p>}
              </div>
            </section>
            ) : null}
          </div>
        </div>
      </div>
    </PortalShell>
  );
}
