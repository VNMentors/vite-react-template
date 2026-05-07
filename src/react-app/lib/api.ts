import type { Customer, Group, Note, Product, Reports, Stats, User } from "./types";

const TOKEN_KEY = "crm_token";
export function getToken()      { return localStorage.getItem(TOKEN_KEY); }
export function setToken(t: string) { localStorage.setItem(TOKEN_KEY, t); }
export function clearToken()    {
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
  login:    (email: string, password: string) =>
    request<{ token: string; user: User }>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  register: (name: string, email: string, password: string) =>
    request<{ token: string; user: User }>("/auth/register", { method: "POST", body: JSON.stringify({ name, email, password }) }),

  // Stats & Reports
  getStats:   () => request<Stats>("/stats"),
  getReports: () => request<Reports>("/reports"),

  // Groups
  getGroups:     () => request<Group[]>("/groups"),
  createGroup:   (data: Partial<Group>) =>
    request<Group>("/groups", { method: "POST", body: JSON.stringify(data) }),
  updateGroup:   (id: number, data: Partial<Group>) =>
    request<Group>(`/groups/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  reorderGroup:  (id: number, direction: "up" | "down") =>
    request<{ success: boolean }>(`/groups/${id}/reorder`, { method: "PATCH", body: JSON.stringify({ direction }) }),
  deleteGroup:   (id: number) =>
    request<{ success: boolean }>(`/groups/${id}`, { method: "DELETE" }),

  // Users
  getUsers:   () =>
    request<{ id: number; email: string; name: string; role: string; created_at: string }[]>("/users"),
  createUser: (name: string, email: string, password: string, role?: string) =>
    request<{ id: number; email: string; name: string; role: string }>("/auth/register",
      { method: "POST", body: JSON.stringify({ name, email, password, role }) }),
  updateUserRole: (id: number, role: string) =>
    request<{ success: boolean }>(`/users/${id}/role`, { method: "PATCH", body: JSON.stringify({ role }) }),
  deleteUser: (id: number) =>
    request<{ success: boolean }>(`/users/${id}`, { method: "DELETE" }),

  // Products
  getProducts:   () => request<Product[]>("/products"),
  createProduct: (data: Partial<Product>) =>
    request<Product>("/products", { method: "POST", body: JSON.stringify(data) }),
  updateProduct: (id: number, data: Partial<Product>) =>
    request<Product>(`/products/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteProduct: (id: number) =>
    request<{ success: boolean }>(`/products/${id}`, { method: "DELETE" }),

  // Customers
  getCustomers: (params?: { q?: string; group_id?: string; product_id?: string; assigned_to?: string; follow_up_today?: string; page?: number }) => {
    const qs = new URLSearchParams();
    if (params?.q)              qs.set("q",              params.q);
    if (params?.group_id)       qs.set("group_id",       params.group_id);
    if (params?.product_id)     qs.set("product_id",     params.product_id);
    if (params?.assigned_to)    qs.set("assigned_to",    params.assigned_to);
    if (params?.follow_up_today) qs.set("follow_up_today", params.follow_up_today);
    if (params?.page)           qs.set("page",           String(params.page));
    return request<{ customers: Customer[]; total: number; page: number; totalPages: number }>(`/customers?${qs}`);
  },
  getCustomer:    (id: number)                    => request<Customer>(`/customers/${id}`),
  createCustomer: (data: Partial<Customer>)       => request<Customer>("/customers", { method: "POST", body: JSON.stringify(data) }),
  updateCustomer: (id: number, data: Partial<Customer>) =>
    request<Customer>(`/customers/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteCustomer: (id: number)                    => request<{ success: boolean }>(`/customers/${id}`, { method: "DELETE" }),

  // Notes
  getNotes:    (customerId: number)                          => request<Note[]>(`/customers/${customerId}/notes`),
  createNote:  (customerId: number, content: string, type: string) =>
    request<Note>(`/customers/${customerId}/notes`, { method: "POST", body: JSON.stringify({ content, type }) }),
  deleteNote:  (customerId: number, noteId: number)         =>
    request<{ success: boolean }>(`/customers/${customerId}/notes/${noteId}`, { method: "DELETE" }),

  // Import
  importCustomers: (rows: unknown[]) =>
    request<{ imported: number; errors: string[] }>("/import/customers", { method: "POST", body: JSON.stringify({ rows }) }),
};
