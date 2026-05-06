export type User = {
  id: number;
  email: string;
  name: string;
};

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

export type Stats = {
  total: number;
  monthly: number;
  lead: number;
  prospect: number;
  active: number;
  inactive: number;
  recentCustomers: Customer[];
};
