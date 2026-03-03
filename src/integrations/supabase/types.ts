export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      direct_investments: {
        Row: {
          co_investors: string | null
          company_name: string
          cost_basis: number
          created_at: string
          geography: string | null
          id: string
          instrument: string | null
          investment_date: string | null
          ownership_percentage: number | null
          round: string | null
          strategy: string | null
          updated_at: string
        }
        Insert: {
          co_investors?: string | null
          company_name: string
          cost_basis?: number
          created_at?: string
          geography?: string | null
          id?: string
          instrument?: string | null
          investment_date?: string | null
          ownership_percentage?: number | null
          round?: string | null
          strategy?: string | null
          updated_at?: string
        }
        Update: {
          co_investors?: string | null
          company_name?: string
          cost_basis?: number
          created_at?: string
          geography?: string | null
          id?: string
          instrument?: string | null
          investment_date?: string | null
          ownership_percentage?: number | null
          round?: string | null
          strategy?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      direct_quarterly_valuations: {
        Row: {
          company_id: string
          created_at: string
          current_valuation: number
          id: string
          quarter_date: string
          realized_proceeds_this_quarter: number
        }
        Insert: {
          company_id: string
          created_at?: string
          current_valuation?: number
          id?: string
          quarter_date: string
          realized_proceeds_this_quarter?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          current_valuation?: number
          id?: string
          quarter_date?: string
          realized_proceeds_this_quarter?: number
        }
        Relationships: [
          {
            foreignKeyName: "direct_quarterly_valuations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "direct_investments"
            referencedColumns: ["id"]
          },
        ]
      }
      fund_cashflows: {
        Row: {
          capital_deployed: number
          cashflow_date: string
          created_at: string
          description: string | null
          distribution_received: number
          fund_id: string
          id: string
        }
        Insert: {
          capital_deployed?: number
          cashflow_date: string
          created_at?: string
          description?: string | null
          distribution_received?: number
          fund_id: string
          id?: string
        }
        Update: {
          capital_deployed?: number
          cashflow_date?: string
          created_at?: string
          description?: string | null
          distribution_received?: number
          fund_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fund_cashflows_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
        ]
      }
      fund_level_cashflows: {
        Row: {
          amount: number
          cashflow_date: string
          created_at: string
          description: string | null
          id: string
          portfolio_name: string | null
          type: string
        }
        Insert: {
          amount: number
          cashflow_date: string
          created_at?: string
          description?: string | null
          id?: string
          portfolio_name?: string | null
          type: string
        }
        Update: {
          amount?: number
          cashflow_date?: string
          created_at?: string
          description?: string | null
          id?: string
          portfolio_name?: string | null
          type?: string
        }
        Relationships: []
      }
      fund_quarterly_reports: {
        Row: {
          capital_called_to_date: number
          created_at: string
          distributions_to_date: number
          fund_id: string
          id: string
          quarter_date: string
          reported_gross_irr: number | null
          reported_gross_tvpi: number | null
          reported_nav: number
          updated_at: string
        }
        Insert: {
          capital_called_to_date?: number
          created_at?: string
          distributions_to_date?: number
          fund_id: string
          id?: string
          quarter_date: string
          reported_gross_irr?: number | null
          reported_gross_tvpi?: number | null
          reported_nav?: number
          updated_at?: string
        }
        Update: {
          capital_called_to_date?: number
          created_at?: string
          distributions_to_date?: number
          fund_id?: string
          id?: string
          quarter_date?: string
          reported_gross_irr?: number | null
          reported_gross_tvpi?: number | null
          reported_nav?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fund_quarterly_reports_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
        ]
      }
      funds: {
        Row: {
          carry_percentage: number
          commitment_amount: number
          created_at: string
          fund_name: string
          geography: string | null
          hurdle_rate: number
          id: string
          management_fee_rate: number
          ownership_percentage: number
          strategy: string | null
          updated_at: string
          vintage_year: number | null
        }
        Insert: {
          carry_percentage?: number
          commitment_amount?: number
          created_at?: string
          fund_name: string
          geography?: string | null
          hurdle_rate?: number
          id?: string
          management_fee_rate?: number
          ownership_percentage?: number
          strategy?: string | null
          updated_at?: string
          vintage_year?: number | null
        }
        Update: {
          carry_percentage?: number
          commitment_amount?: number
          created_at?: string
          fund_name?: string
          geography?: string | null
          hurdle_rate?: number
          id?: string
          management_fee_rate?: number
          ownership_percentage?: number
          strategy?: string | null
          updated_at?: string
          vintage_year?: number | null
        }
        Relationships: []
      }
      portfolio_snapshots: {
        Row: {
          created_at: string
          id: string
          lp_nav: number
          notes: string | null
          quarter_date: string
        }
        Insert: {
          created_at?: string
          id?: string
          lp_nav?: number
          notes?: string | null
          quarter_date: string
        }
        Update: {
          created_at?: string
          id?: string
          lp_nav?: number
          notes?: string | null
          quarter_date?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
