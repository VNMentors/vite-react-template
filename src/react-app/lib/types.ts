export type User = {
  id: number;
  email: string;
  name: string;
  role: "admin" | "staff";
};

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
  last_note_at: string | null;
  last_note_type: string | null;
  created_at: string;
  updated_at: string;
};

export type PipelineCustomer = Customer & {
  last_note_type: string | null;
  last_note_at: string | null;
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
  lead_count?: number;
  won_count?: number;
  revenue?: number;
};

export type LmsClient = {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  domain: string;            // required — dùng làm KV key
  contract_start: string;
  contract_end: string;
  user_count: number;
  price: number | null;
  note: string | null;
  status: string;            // active | suspended | expired
  source_customer_id: number | null;
  created_at: string;
  updated_at: string;
};

export type LmsInvoice = {
  id: number;
  client_id: number;
  amount: number;
  issued_at: string;
  paid_at: string | null;
  note: string | null;
  created_at: string;
};

export type Subscription = {
  id: number;
  customer_id: number;
  product_id: number | null;
  product_name: string | null;
  start_date: string;
  end_date: string;
  user_count: number | null;
  price_paid: number | null;
  note: string | null;
  created_at: string;
};

export type Invoice = {
  id: number;
  customer_id: number;
  amount: number;
  issued_at: string;
  paid_at: string | null;
  note: string | null;
  created_at: string;
};

export type Stats = {
  total: number;
  monthly: number;
  revenue: number;
  won: number;
  unassigned: number;
  myLeads: number | null;
  recentCustomers: Customer[];
  followUps: Customer[];
  byGroup: {
    id: number;
    name: string;
    color: string;
    order_index: number;
    is_won: number;
    count: number;
  }[];
};

export type Reports = {
  summary: {
    total_leads: number;
    total_won: number;
    total_revenue: number;
    revenue_990: number;
    revenue_lms: number;
    lms_client_count: number;
    conversion_rate: number;
  };
  byGroup: { id: number; name: string; color: string; order_index: number; is_won: number; leads: number; revenue: number }[];
  byProduct: { product_name: string; leads: number; won: number; revenue: number }[];
  bySource: { source: string; leads: number; won: number }[];
  byStaff: { staff: string; leads: number; won: number; revenue: number }[];
  monthlyTrend: { month: string; leads: number; won: number; revenue: number }[];
  staffActivity: { staff: string; total_activities: number; calls: number; meetings: number; emails: number; leads_worked: number }[];
};
