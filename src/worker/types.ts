export type Bindings = {
  DB: D1Database;
  JWT_SECRET: string;
};

export type Variables = {
  userId: number;
};

export type AppEnv = { Bindings: Bindings; Variables: Variables };

export type Customer = {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  status: string;
  source: string | null;
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
