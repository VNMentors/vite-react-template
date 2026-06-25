import type { Customer, Group, Invoice, LmsClient, LmsInvoice, Note, PipelineCustomer, Product, Reports, Stats, Subscription, User, BackgroundJob, CampaignDetails } from "./types";

const TOKEN_KEY = "crm_token";
export function getToken() { return localStorage.getItem(TOKEN_KEY); }
export function setToken(t: string) { localStorage.setItem(TOKEN_KEY, t); }
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem("crm_user");
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) ?? {}),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`/api${path}`, { ...options, headers });
  if (res.status === 401) { clearToken(); window.location.href = "/login"; throw new Error("Unauthorized"); }
  if (!res.ok) {
    const err = (await res.json()) as { error: string };
    throw new Error(err.error ?? "Request failed");
  }
  return res.json() as Promise<T>;
}

export const api = {
  // Auth
  login: (email: string, password: string) =>
    request<{ token: string; user: User }>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  register: (name: string, email: string, password: string) =>
    request<{ token: string; user: User }>("/auth/register", { method: "POST", body: JSON.stringify({ name, email, password }) }),

  // Stats & Reports
  getStats:   () => request<Stats>("/stats"),
  getReports: (params?: { from?: string; to?: string }) => {
    const qs = new URLSearchParams();
    if (params?.from) qs.set("from", params.from);
    if (params?.to)   qs.set("to",   params.to);
    const q = qs.toString();
    return request<Reports>(`/reports${q ? "?" + q : ""}`);
  },

  // Groups
  getGroups: () => request<Group[]>("/groups"),
  createGroup: (data: Partial<Group>) =>
    request<Group>("/groups", { method: "POST", body: JSON.stringify(data) }),
  updateGroup: (id: number, data: Partial<Group>) =>
    request<Group>(`/groups/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  reorderGroup: (id: number, direction: "up" | "down") =>
    request<{ success: boolean }>(`/groups/${id}/reorder`, { method: "PATCH", body: JSON.stringify({ direction }) }),
  deleteGroup: (id: number) =>
    request<{ success: boolean }>(`/groups/${id}`, { method: "DELETE" }),

  // Users
  getUsers: () =>
    request<{ id: number; email: string; name: string; role: string; created_at: string }[]>("/users"),
  createUser: (name: string, email: string, password: string, role?: string) =>
    request<{ id: number; email: string; name: string; role: string }>("/auth/register",
      { method: "POST", body: JSON.stringify({ name, email, password, role }) }),
  updateUser: (id: number, data: { name?: string; email?: string; password?: string; role?: string }) =>
    request<{ id: number; name: string; email: string; role: string }>(`/users/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  updateUserRole: (id: number, role: string) =>
    request<{ success: boolean }>(`/users/${id}/role`, { method: "PATCH", body: JSON.stringify({ role }) }),
  deleteUser: (id: number) =>
    request<{ success: boolean }>(`/users/${id}`, { method: "DELETE" }),

  // Products
  getProducts: () => request<Product[]>("/products"),
  createProduct: (data: Partial<Product>) =>
    request<Product>("/products", { method: "POST", body: JSON.stringify(data) }),
  updateProduct: (id: number, data: Partial<Product>) =>
    request<Product>(`/products/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteProduct: (id: number) =>
    request<{ success: boolean; deleted?: boolean; deactivated?: boolean; references?: number }>(`/products/${id}`, { method: "DELETE" }),

  // Customers
  getCustomers: (params?: {
    q?: string;
    group_id?: string;
    product_id?: string;
    assigned_to?: string;
    follow_up_today?: string;
    page?: number;
    status?: string;
    from_date?: string;
    to_date?: string;
    sort_by?: string;
    sort_order?: string;
  }) => {
    const qs = new URLSearchParams();
    if (params?.q) qs.set("q", params.q);
    if (params?.group_id) qs.set("group_id", params.group_id);
    if (params?.product_id) qs.set("product_id", params.product_id);
    if (params?.assigned_to) qs.set("assigned_to", params.assigned_to);
    if (params?.follow_up_today) qs.set("follow_up_today", params.follow_up_today);
    if (params?.page) qs.set("page", String(params.page));
    if (params?.status) qs.set("status", params.status);
    if (params?.from_date) qs.set("from_date", params.from_date);
    if (params?.to_date) qs.set("to_date", params.to_date);
    if (params?.sort_by) qs.set("sort_by", params.sort_by);
    if (params?.sort_order) qs.set("sort_order", params.sort_order);
    return request<{ customers: Customer[]; total: number; page: number; totalPages: number }>(`/customers?${qs}`);
  },
  getCustomer: (id: number) => request<Customer>(`/customers/${id}`),
  createCustomer: (data: Partial<Customer>) => request<Customer>("/customers", { method: "POST", body: JSON.stringify(data) }),
  updateCustomer: (id: number, data: Partial<Customer>) =>
    request<Customer>(`/customers/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteCustomer: (id: number) => request<{ success: boolean }>(`/customers/${id}`, { method: "DELETE" }),

  // Pipeline (Kanban)
  getPipeline: () => request<PipelineCustomer[]>("/customers/pipeline"),

  // Notes
  getNotes: (customerId: number) => request<Note[]>(`/customers/${customerId}/notes`),
  createNote: (customerId: number, content: string, type: string) =>
    request<Note>(`/customers/${customerId}/notes`, { method: "POST", body: JSON.stringify({ content, type }) }),
  deleteNote: (customerId: number, noteId: number) =>
    request<{ success: boolean }>(`/customers/${customerId}/notes/${noteId}`, { method: "DELETE" }),

  // Bulk operations
  bulkCustomers: (body: {
    ids: number[];
    action: "assign" | "group" | "auto_distribute";
    user_id?: number | null; user_name?: string | null;
    group_id?: number | null;
    user_ids?: number[]; user_names?: string[];
  }) => request<{ success: boolean; updated: number }>(
    "/customers/bulk", { method: "PATCH", body: JSON.stringify(body) }
  ),

  // Import
  importCustomers: (rows: unknown[]) =>
    request<{ imported: number; updated: number; skipped: number; errors: string[]; warnings: string[] }>(
      "/import/customers",
      { method: "POST", body: JSON.stringify({ rows, duplicate_mode: "update" }) },
    ),

  // Subscriptions
  getSubscriptions: (customerId: number) =>
    request<Subscription[]>(`/customers/${customerId}/subscriptions`),
  createSubscription: (customerId: number, data: Partial<Subscription>) =>
    request<Subscription>(`/customers/${customerId}/subscriptions`, { method: "POST", body: JSON.stringify(data) }),
  deleteSubscription: (customerId: number, subId: number) =>
    request<{ success: boolean }>(`/customers/${customerId}/subscriptions/${subId}`, { method: "DELETE" }),

  // Invoices
  getInvoices: (customerId: number) =>
    request<Invoice[]>(`/customers/${customerId}/invoices`),
  createInvoice: (customerId: number, data: Partial<Invoice>) =>
    request<Invoice>(`/customers/${customerId}/invoices`, { method: "POST", body: JSON.stringify(data) }),
  markInvoicePaid: (customerId: number, invoiceId: number) =>
    request<{ success: boolean }>(`/customers/${customerId}/invoices/${invoiceId}/pay`, { method: "PATCH" }),
  deleteInvoice: (customerId: number, invoiceId: number) =>
    request<{ success: boolean }>(`/customers/${customerId}/invoices/${invoiceId}`, { method: "DELETE" }),

  // LMS Clients
  getLmsClients: () => request<LmsClient[]>("/lms"),
  createLmsClient: (data: Partial<LmsClient>) =>
    request<LmsClient>("/lms", { method: "POST", body: JSON.stringify(data) }),
  updateLmsClient: (id: number, data: Partial<LmsClient>) =>
    request<LmsClient>(`/lms/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  setLmsClientStatus: (id: number, status: string) =>
    request<{ success: boolean; status: string }>(`/lms/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
  reprovisionLmsClient: (id: number) =>
    request<{ success: boolean; kv_key: string }>(`/lms/${id}/provision`, { method: "POST" }),
  deleteLmsClient: (id: number) =>
    request<{ success: boolean }>(`/lms/${id}`, { method: "DELETE" }),
  getLmsInvoices: (clientId: number) => request<LmsInvoice[]>(`/lms/${clientId}/invoices`),
  createLmsInvoice: (clientId: number, data: Partial<LmsInvoice>) =>
    request<LmsInvoice>(`/lms/${clientId}/invoices`, { method: "POST", body: JSON.stringify(data) }),
  markLmsInvoicePaid: (clientId: number, invoiceId: number) =>
    request<{ success: boolean }>(`/lms/${clientId}/invoices/${invoiceId}/pay`, { method: "PATCH" }),
  deleteLmsInvoice: (clientId: number, invoiceId: number) =>
    request<{ success: boolean }>(`/lms/${clientId}/invoices/${invoiceId}`, { method: "DELETE" }),

  // Email Campaigns
  getEmailCampaigns: () => request<{ success: boolean; data: BackgroundJob[] }>("/email/campaigns"),
  getEmailCampaign: (id: number) => request<{ success: boolean; data: CampaignDetails }>(`/email/campaigns/${id}`),
  getEmailRecipientsCount: () => request<{ success: boolean; count: number }>("/email/recipients-count"),
  getEmailRecipientsAutocomplete: () => request<{ success: boolean; data: { id: number; name: string; email: string }[] }>("/email/recipients-autocomplete"),
  createEmailCampaign: (body: { subject: string; htmlContent: string; customerIds: number[]; customEmails?: string[]; status?: 'DRAFT' | 'PENDING' | 'SCHEDULED'; scheduledAt?: string }) =>
    request<{ success: boolean; message: string; data: { jobId: number; total: number } }>("/email/campaigns", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  startEmailCampaign: (id: number) =>
    request<{ success: boolean; message: string }>(`/email/campaigns/${id}/start`, { method: "POST" }),
  cancelEmailCampaign: (id: number) =>
    request<{ success: boolean; message: string }>(`/email/campaigns/${id}/cancel`, { method: "PATCH" }),
  testEmailCampaign: (body: { subject: string; htmlContent: string }) =>
    request<{ success: boolean; message: string }>("/email/campaigns/test", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  sendSingleEmail: (body: { toEmail: string; subject: string; htmlContent: string }) =>
    request<{ success: boolean; message: string }>("/email/send-single", {
      method: "POST",
      body: JSON.stringify(body),
    }),
};

