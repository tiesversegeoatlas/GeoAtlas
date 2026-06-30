export type PortalPlan = {
  id: string;
  code: string;
  name: string;
  description: string | null;
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
  organization: string | null;
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
  requests_per_minute: number;
  monthly_request_limit: number;
  monthly_request_count: number;
  usage_month: string;
  created_at: string;
  last_used_at: string | null;
  plaintext_key: string | null;
};

export type PortalInvoice = {
  id: string;
  plan_code: string;
  amount_inr: number;
  currency: string;
  status: string;
  due_date: string | null;
  paid_at: string | null;
  notes: string | null;
  issued_at: string;
};

export type PortalDashboard = {
  user: PortalUser;
  plan: PortalPlan | null;
  api_keys: PortalApiKey[];
  invoices: PortalInvoice[];
  hidden_admin_slug: string | null;
};

export type PortalAdminOverview = {
  total_users: number;
  active_users: number;
  total_api_keys: number;
  active_api_keys: number;
  monthly_requests: number;
  monthly_revenue_inr: number;
  total_invoices: number;
  hidden_admin_slug: string;
};

const API_ROOT = "/api/geoatlas/api/v1";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_ROOT}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });
  if (!response.ok) {
    let detail = `Request failed (${response.status})`;
    try {
      const payload = await response.json();
      if (payload?.detail) detail = payload.detail;
    } catch {
      // ignore
    }
    throw new Error(detail);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

export function registerPortalAccount(payload: {
  full_name: string;
  email: string;
  organization?: string;
  password: string;
}) {
  return request<PortalDashboard>("/portal/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function loginPortalAccount(payload: { email: string; password: string }) {
  return request<PortalDashboard>("/portal/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function logoutPortalAccount() {
  return request<{ status: string }>("/portal/logout", { method: "POST", body: "{}" });
}

export function fetchPortalDashboard() {
  return request<PortalDashboard>("/portal/me");
}

export function fetchPortalPlans() {
  return request<PortalPlan[]>("/portal/plans");
}

export function createPortalApiKey(label: string) {
  return request<PortalApiKey>("/portal/api-keys", {
    method: "POST",
    body: JSON.stringify({ label }),
  });
}

export function revokePortalApiKey(id: string) {
  return request<{ status: string }>(`/portal/api-keys/${encodeURIComponent(id)}/revoke`, {
    method: "POST",
    body: "{}",
  });
}

export function fetchPortalAdminOverview() {
  return request<PortalAdminOverview>("/portal-admin/overview");
}

export function fetchPortalAdminUsers() {
  return request<PortalUser[]>("/portal-admin/users");
}

export function updatePortalAdminUser(
  id: string,
  payload: { plan_id?: string | null; billing_status: string; active: boolean; is_admin: boolean },
) {
  return request<PortalUser>(`/portal-admin/users/${encodeURIComponent(id)}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function fetchPortalAdminPlans() {
  return request<PortalPlan[]>("/portal-admin/plans");
}

export function createPortalAdminPlan(payload: Omit<PortalPlan, "id">) {
  return request<PortalPlan>("/portal-admin/plans", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updatePortalAdminPlan(id: string, payload: Omit<PortalPlan, "id">) {
  return request<PortalPlan>(`/portal-admin/plans/${encodeURIComponent(id)}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function fetchPortalAdminApiKeys() {
  return request<PortalApiKey[]>("/portal-admin/api-keys");
}

export function fetchPortalAdminInvoices() {
  return request<PortalInvoice[]>("/portal-admin/invoices");
}

export function createPortalAdminInvoice(payload: {
  user_id: string;
  amount_inr: number;
  status: string;
  plan_code: string;
  notes?: string | null;
}) {
  return request<PortalInvoice>("/portal-admin/invoices", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
