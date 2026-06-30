export type PortalPlan = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  monthly_price_inr: number;
  requests_per_minute: number;
  monthly_request_limit: number;
  max_api_keys: number;
  active: boolean;
  public_visible: boolean;
};

export type PortalUser = {
  id: string;
  full_name: string;
  email: string;
  organization?: string | null;
  is_admin: boolean;
  active: boolean;
  billing_status: string;
  created_at: string;
  plan: PortalPlan | null;
};

export type PortalApiKey = {
  id: string;
  label: string;
  key_prefix: string;
  active: boolean;
  created_at: string;
  revoked_at?: string | null;
  requests_per_minute: number;
  monthly_request_limit: number;
  monthly_request_count: number;
  plaintext_key?: string | null;
};

export type PortalInvoice = {
  id: string;
  user_id: string;
  plan_code: string;
  amount_inr: number;
  currency: string;
  status: string;
  due_date?: string | null;
  paid_at?: string | null;
  notes?: string | null;
  issued_at: string;
};

export type PortalDashboard = {
  user: PortalUser;
  plan: PortalPlan | null;
  api_keys: PortalApiKey[];
  invoices: PortalInvoice[];
  hidden_admin_slug?: string | null;
};

export type PortalAdminOverview = {
  total_users: number;
  active_users: number;
  total_api_keys: number;
  active_api_keys: number;
  monthly_revenue_inr: number;
  total_invoices: number;
  hidden_admin_slug: string;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/portal${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    let message = "Request failed.";
    try {
      const payload = await response.json();
      message = payload.detail || message;
    } catch {}
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export const portalApi = {
  register: (payload: { full_name: string; email: string; password: string; organization?: string }) =>
    request<PortalDashboard>("/api/v1/portal/register", { method: "POST", body: JSON.stringify(payload) }),
  login: (payload: { email: string; password: string }) =>
    request<PortalDashboard>("/api/v1/portal/login", { method: "POST", body: JSON.stringify(payload) }),
  logout: () => request<{ status: string }>("/api/v1/portal/logout", { method: "POST", body: "{}" }),
  me: () => request<PortalDashboard>("/api/v1/portal/me"),
  plans: () => request<PortalPlan[]>("/api/v1/portal/plans"),
  createKey: (label: string) =>
    request<PortalApiKey>("/api/v1/portal/api-keys", { method: "POST", body: JSON.stringify({ label }) }),
  revokeKey: (id: string) =>
    request<{ status: string }>(`/api/v1/portal/api-keys/${encodeURIComponent(id)}/revoke`, { method: "POST", body: "{}" }),
  adminOverview: () => request<PortalAdminOverview>("/api/v1/portal-admin/overview"),
  adminUsers: () => request<PortalUser[]>("/api/v1/portal-admin/users"),
  adminUpdateUser: (id: string, payload: Record<string, unknown>) =>
    request<PortalUser>(`/api/v1/portal-admin/users/${encodeURIComponent(id)}`, { method: "POST", body: JSON.stringify(payload) }),
  adminPlans: () => request<PortalPlan[]>("/api/v1/portal-admin/plans"),
  adminCreatePlan: (payload: Omit<PortalPlan, "id">) =>
    request<PortalPlan>("/api/v1/portal-admin/plans", { method: "POST", body: JSON.stringify(payload) }),
  adminUpdatePlan: (id: string, payload: Omit<PortalPlan, "id">) =>
    request<PortalPlan>(`/api/v1/portal-admin/plans/${encodeURIComponent(id)}`, { method: "POST", body: JSON.stringify(payload) }),
  adminDeletePlan: (id: string) =>
    request<{ status: string }>(`/api/v1/portal-admin/plans/${encodeURIComponent(id)}`, { method: "DELETE" }),
  adminApiKeys: () => request<PortalApiKey[]>("/api/v1/portal-admin/api-keys"),
  adminInvoices: () => request<PortalInvoice[]>("/api/v1/portal-admin/invoices"),
  adminCreateInvoice: (payload: { user_id: string; plan_code: string; amount_inr: number; status: string; notes?: string }) =>
    request<PortalInvoice>("/api/v1/portal-admin/invoices", { method: "POST", body: JSON.stringify(payload) }),
};
