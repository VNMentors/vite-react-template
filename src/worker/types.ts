export type Bindings = {
  DB: D1Database;
  JWT_SECRET: string;
  API_KEY: string;
  LMS_KV: KVNamespace; // KV namespace dùng cho LMS SaaS tenant routing
};

export type Variables = {
  userId: number;
  userRole: string;
  userName: string;
};

export type AppEnv = { Bindings: Bindings; Variables: Variables };

export type Group = {
  id: number;
  name: string;
  description: string | null;
  color: string;
  order_index: number;
  is_won: number;
  customer_count?: number;
  created_at: string;
};

export type Customer = {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  facebook_link: string | null;
  company: string | null;
  product_id: number | null;
  product_name: string | null;
  group_id: number | null;
  group_name: string | null;
  group_color: string | null;
  group_is_won: number | null;
  assigned_to: string | null;
  assigned_user_id: number | null;
  status: string;
  source: string | null;
  list_price: number | null;
  discount_pct: number | null;
  final_price: number | null;
  follow_up_at: string | null;
  follow_up_note: string | null;
  created_at: string;
  updated_at: string;
};

export type Note = {
  id: number;
  customer_id: number;
  content: string;
  type: string;
  created_at: string;
};

export type Product = {
  id: number;
  name: string;
  price: number;
  description: string | null;
  active: number;
  created_at: string;
};
