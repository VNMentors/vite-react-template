import type { Customer, Note, Stats, User } from "./types";

const TOKEN_KEY = "crm_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
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

  if (res.status === 401) {
    clearToken();
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    const err = (await res.json()) as { error: string };
    throw new Error(err.error ?? "Request failed");
  }

  return res.json() as Promise<T>;
}

export const api = {
  // Auth
  login: (email: string, password: string) =>
    request<{ token: string; user: User }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  register: (name: string, email: string, password: string) =>
    request<{ token: string; user: User }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
    }),

  // Users
  getUsers: () =>
    request<{ id: number; email: string; name: string; created_at: string }[]>(
      "/users"
    ),

  createUser: (name: string, email: string, password: string) =>
    request<{ id: number; email: string; name: string }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
    }),

  deleteUser: (id: number) =>
    request<{ success: boolean }>(`/users/${id}`, { method: "DELETE" }),

  // Stats
  getStats: () => request<Stats>("/stats"),

  // Customers
  getCustomers: (params?: { q?: string; status?: string; page?: number }) => {
    const qs = new URLSearchParams();
    if (params?.q) qs.set("q", params.q);
    if (params?.status) qs.set("status", params.status);
    if (params?.page) qs.set("page", String(params.page));
    return request<{
      customers: Customer[];
      total: number;
      page: number;
      totalPages: number;
    }>(`/customers?${qs}`);
  },

  getCustomer: (id: number) => request<Customer>(`/customers/${id}`),

  createCustomer: (data: Partial<Customer>) =>
    request<Customer>("/customers", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateCustomer: (id: number, data: Partial<Customer>) =>
    request<Customer>(`/customers/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  deleteCustomer: (id: number) =>
    request<{ success: boolean }>(`/customers/${id}`, { method: "DELETE" }),

  // Notes
  getNotes: (customerId: number) =>
    request<Note[]>(`/customers/${customerId}/notes`),

  createNote: (customerId: number, content: string, type: string) =>
    request<Note>(`/customers/${customerId}/notes`, {
      method: "POST",
      body: JSON.stringify({ content, type }),
    }),

  deleteNote: (customerId: number, noteId: number) =>
    request<{ success: boolean }>(
      `/customers/${customerId}/notes/${noteId}`,
      { method: "DELETE" }
    ),
};
