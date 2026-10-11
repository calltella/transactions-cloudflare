export type TransactionRow = {
  id: number;
  user_id: string;
  date: string;
  type: string;
  payment_method: string | null;
  parent_category: string | null;
  child_category: string | null;
  amount: number | null;
  location: string | null;
  memo: string | null;
  note: string | null;
  tag: string | null;
  created_at: string;
};

export type TransactionInput = Pick<TransactionRow, "date" | "type"> &
  Partial<Omit<TransactionRow, "id" | "user_id" | "created_at" | "date" | "type">>;

export type CreditCardRow = {
  id: number; user_id: string; payment_method_id: number;
  closing_day: number | null; payment_day: number | null; payment_month_offset: number;
  bank_account_payment_method_id: number | null; is_active: boolean; memo: string | null;
  created_at: string; updated_at: string;
};

export type BankAccountRow = {
  id: number; user_id: string; payment_method_id: number;
  bank_name: string | null; branch_name: string | null; account_holder: string | null;
  opening_balance: number | null; opening_balance_date: string | null;
  is_active: boolean; memo: string | null; created_at: string; updated_at: string;
};

export interface Database {
  public: {
    Tables: {
      dashboard_settings: {
        Row: { user_id: string; month_start_day: number; month_end_day: number; month_start_holiday_adjustment: "none" | "previous" | "next"; updated_at: string };
        Insert: { user_id?: string; month_start_day?: number; month_end_day?: number; month_start_holiday_adjustment?: "none" | "previous" | "next"; updated_at?: string };
        Update: { month_start_day?: number; month_end_day?: number; month_start_holiday_adjustment?: "none" | "previous" | "next"; updated_at?: string };
        Relationships: [];
      };
      transactions: {
        Row: { id: number; user_id: string; date: string; type_id: number | null; payment_method_id: number | null; parent_category_id: number | null; child_category_id: number | null; amount: number | null; location: string | null; memo: string | null; note: string | null; tag: string | null; created_at: string };
        Insert: Pick<Database["public"]["Tables"]["transactions"]["Row"], "date"> & Partial<Omit<Database["public"]["Tables"]["transactions"]["Row"], "id" | "date">>;
        Update: Partial<Omit<Database["public"]["Tables"]["transactions"]["Row"], "id" | "user_id" | "created_at">>;
        Relationships: [];
      };
      transaction_types: {
        Row: { id: number; name: string; created_at: string };
        Insert: { name: string };
        Update: { name?: string };
        Relationships: [];
      };
      bank_accounts: {
        Row: BankAccountRow;
        Insert: Pick<BankAccountRow, "payment_method_id"> & Partial<Omit<BankAccountRow, "id" | "payment_method_id">>;
        Update: Partial<Omit<BankAccountRow, "id" | "user_id">>;
        Relationships: [];
      };
      credit_cards: {
        Row: CreditCardRow;
        Insert: Pick<CreditCardRow, "payment_method_id"> & Partial<Omit<CreditCardRow, "id" | "payment_method_id">>;
        Update: Partial<Omit<CreditCardRow, "id" | "user_id">>;
        Relationships: [];
      };
      payment_methods: {
        Row: { id: number; name: string; type: string; created_at: string };
        Insert: { name: string; type?: string };
        Update: { name?: string; type?: string };
        Relationships: [];
      };
      transactions_work: {
        Row: TransactionRow;
        Insert: TransactionInput & { user_id?: string };
        Update: Partial<TransactionInput>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      insert_normalized_transactions: {
        Args: Record<string, never>;
        Returns: { insertedCount: number };
      };
      normalize_categories: {
        Args: Record<string, never>;
        Returns: { deletedTransactionsCount: number; deletedParentsCount: number; deletedChildrenCount: number; registeredParentsCount: number; registeredChildrenCount: number };
      };
      normalize_payment_methods: {
        Args: Record<string, never>;
        Returns: { deletedCount: number; deletedTransactionsCount: number; registeredCount: number };
      };
      normalize_transaction_types: {
        Args: Record<string, never>;
        Returns: { deletedCount: number; deletedTransactionsCount: number; registeredCount: number };
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
