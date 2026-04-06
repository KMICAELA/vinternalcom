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
      app_settings: {
        Row: {
          id: string
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          created_at: string | null
          details: Json | null
          id: string
          performed_by: string
          quarter_date: string | null
          target_id: string | null
          target_table: string
        }
        Insert: {
          action: string
          created_at?: string | null
          details?: Json | null
          id?: string
          performed_by: string
          quarter_date?: string | null
          target_id?: string | null
          target_table: string
        }
        Update: {
          action?: string
          created_at?: string | null
          details?: Json | null
          id?: string
          performed_by?: string
          quarter_date?: string | null
          target_id?: string | null
          target_table?: string
        }
        Relationships: []
      }
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
          cashflow_type: string
          created_at: string
          description: string | null
          distribution_received: number
          fund_id: string
          id: string
        }
        Insert: {
          capital_deployed?: number
          cashflow_date: string
          cashflow_type?: string
          created_at?: string
          description?: string | null
          distribution_received?: number
          fund_id: string
          id?: string
        }
        Update: {
          capital_deployed?: number
          cashflow_date?: string
          cashflow_type?: string
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
      fund_extraction_templates: {
        Row: {
          created_at: string | null
          field_mappings: Json
          fund_id: string
          id: string
          notes: string | null
          sample_extraction: Json | null
          template_name: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          field_mappings?: Json
          fund_id: string
          id?: string
          notes?: string | null
          sample_extraction?: Json | null
          template_name?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          field_mappings?: Json
          fund_id?: string
          id?: string
          notes?: string | null
          sample_extraction?: Json | null
          template_name?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fund_extraction_templates_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: true
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
        ]
      }
      fund_financial_statements: {
        Row: {
          confirmed: boolean
          created_at: string
          extracted_data: Json
          file_path: string | null
          fund_id: string
          id: string
          quarter_date: string
          updated_at: string
        }
        Insert: {
          confirmed?: boolean
          created_at?: string
          extracted_data?: Json
          file_path?: string | null
          fund_id: string
          id?: string
          quarter_date: string
          updated_at?: string
        }
        Update: {
          confirmed?: boolean
          created_at?: string
          extracted_data?: Json
          file_path?: string | null
          fund_id?: string
          id?: string
          quarter_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fund_financial_statements_fund_id_fkey"
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
          company_industries: string | null
          created_at: string
          currency: string
          fund_name: string
          geography: string | null
          hurdle_rate: number
          id: string
          management_fee_rate: number
          ownership_percentage: number
          start_date: string | null
          strategy: string | null
          target_industries: string | null
          theme: string | null
          updated_at: string
          vintage_year: number | null
        }
        Insert: {
          carry_percentage?: number
          commitment_amount?: number
          company_industries?: string | null
          created_at?: string
          currency?: string
          fund_name: string
          geography?: string | null
          hurdle_rate?: number
          id?: string
          management_fee_rate?: number
          ownership_percentage?: number
          start_date?: string | null
          strategy?: string | null
          target_industries?: string | null
          theme?: string | null
          updated_at?: string
          vintage_year?: number | null
        }
        Update: {
          carry_percentage?: number
          commitment_amount?: number
          company_industries?: string | null
          created_at?: string
          currency?: string
          fund_name?: string
          geography?: string | null
          hurdle_rate?: number
          id?: string
          management_fee_rate?: number
          ownership_percentage?: number
          start_date?: string | null
          strategy?: string | null
          target_industries?: string | null
          theme?: string | null
          updated_at?: string
          vintage_year?: number | null
        }
        Relationships: []
      }
      highlight_entries: {
        Row: {
          body: string
          created_at: string
          entity_name: string
          id: string
          quarter_date: string
          update_type: string
          updated_at: string
          url: string | null
        }
        Insert: {
          body?: string
          created_at?: string
          entity_name: string
          id?: string
          quarter_date: string
          update_type?: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          entity_name?: string
          id?: string
          quarter_date?: string
          update_type?: string
          updated_at?: string
          url?: string | null
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
      quarterly_commentary: {
        Row: {
          body: string
          created_at: string | null
          id: string
          quarter_date: string
          section: string
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          body: string
          created_at?: string | null
          id?: string
          quarter_date: string
          section: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          body?: string
          created_at?: string | null
          id?: string
          quarter_date?: string
          section?: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      quarterly_history: {
        Row: {
          computation_source: string
          confirmed_at: string | null
          confirmed_by: string | null
          contribution: number
          created_at: string
          distribution: number
          dpi: number
          gross_irr: number
          gross_tvpi: number
          id: string
          locked: boolean
          nav: number
          net_irr: number
          net_tvpi: number
          pic: number
          quarter: string
          quarter_date: string
          rvpi: number
          total_called: number
          total_commitment: number
          total_distributed: number
          total_nav: number
          unfunded: number
        }
        Insert: {
          computation_source?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          contribution?: number
          created_at?: string
          distribution?: number
          dpi?: number
          gross_irr?: number
          gross_tvpi?: number
          id?: string
          locked?: boolean
          nav?: number
          net_irr?: number
          net_tvpi?: number
          pic?: number
          quarter: string
          quarter_date: string
          rvpi?: number
          total_called?: number
          total_commitment?: number
          total_distributed?: number
          total_nav?: number
          unfunded?: number
        }
        Update: {
          computation_source?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          contribution?: number
          created_at?: string
          distribution?: number
          dpi?: number
          gross_irr?: number
          gross_tvpi?: number
          id?: string
          locked?: boolean
          nav?: number
          net_irr?: number
          net_tvpi?: number
          pic?: number
          quarter?: string
          quarter_date?: string
          rvpi?: number
          total_called?: number
          total_commitment?: number
          total_distributed?: number
          total_nav?: number
          unfunded?: number
        }
        Relationships: []
      }
      reconciliation_checks: {
        Row: {
          actual_value: number | null
          check_type: string
          created_at: string | null
          description: string
          entity_name: string | null
          expected_value: number | null
          id: string
          quarter_date: string
          resolved: boolean | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          variance_pct: number | null
        }
        Insert: {
          actual_value?: number | null
          check_type: string
          created_at?: string | null
          description: string
          entity_name?: string | null
          expected_value?: number | null
          id?: string
          quarter_date: string
          resolved?: boolean | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity: string
          variance_pct?: number | null
        }
        Update: {
          actual_value?: number | null
          check_type?: string
          created_at?: string | null
          description?: string
          entity_name?: string | null
          expected_value?: number | null
          id?: string
          quarter_date?: string
          resolved?: boolean | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          variance_pct?: number | null
        }
        Relationships: []
      }
      staged_direct_imports: {
        Row: {
          co_investors: string | null
          company_name: string
          cost_basis: number | null
          created_at: string | null
          current_valuation: number | null
          geography: string | null
          id: string
          instrument: string | null
          investment_date: string | null
          ownership_percentage: number | null
          quarter_date: string | null
          raw_extraction: Json | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewer_notes: string | null
          round: string | null
          source_file_name: string | null
          source_type: string
          status: string
          strategy: string | null
          updated_at: string | null
        }
        Insert: {
          co_investors?: string | null
          company_name: string
          cost_basis?: number | null
          created_at?: string | null
          current_valuation?: number | null
          geography?: string | null
          id?: string
          instrument?: string | null
          investment_date?: string | null
          ownership_percentage?: number | null
          quarter_date?: string | null
          raw_extraction?: Json | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_notes?: string | null
          round?: string | null
          source_file_name?: string | null
          source_type: string
          status?: string
          strategy?: string | null
          updated_at?: string | null
        }
        Update: {
          co_investors?: string | null
          company_name?: string
          cost_basis?: number | null
          created_at?: string | null
          current_valuation?: number | null
          geography?: string | null
          id?: string
          instrument?: string | null
          investment_date?: string | null
          ownership_percentage?: number | null
          quarter_date?: string | null
          raw_extraction?: Json | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_notes?: string | null
          round?: string | null
          source_file_name?: string | null
          source_type?: string
          status?: string
          strategy?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      staged_fund_extractions: {
        Row: {
          confidence_score: number | null
          created_at: string | null
          extracted_at: string | null
          extracted_capital_called: number | null
          extracted_commitment: number | null
          extracted_companies: Json | null
          extracted_distributions: number | null
          extracted_dpi: number | null
          extracted_gross_irr: number | null
          extracted_gross_tvpi: number | null
          extracted_nav: number | null
          extracted_net_irr: number | null
          extracted_net_tvpi: number | null
          extracted_pic: number | null
          extracted_rvpi: number | null
          extracted_unfunded: number | null
          extraction_model: string | null
          fund_id: string
          id: string
          quarter_date: string
          raw_extraction: Json | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewer_notes: string | null
          source_file_name: string | null
          source_file_path: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string | null
          extracted_at?: string | null
          extracted_capital_called?: number | null
          extracted_commitment?: number | null
          extracted_companies?: Json | null
          extracted_distributions?: number | null
          extracted_dpi?: number | null
          extracted_gross_irr?: number | null
          extracted_gross_tvpi?: number | null
          extracted_nav?: number | null
          extracted_net_irr?: number | null
          extracted_net_tvpi?: number | null
          extracted_pic?: number | null
          extracted_rvpi?: number | null
          extracted_unfunded?: number | null
          extraction_model?: string | null
          fund_id: string
          id?: string
          quarter_date: string
          raw_extraction?: Json | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_notes?: string | null
          source_file_name?: string | null
          source_file_path?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          confidence_score?: number | null
          created_at?: string | null
          extracted_at?: string | null
          extracted_capital_called?: number | null
          extracted_commitment?: number | null
          extracted_companies?: Json | null
          extracted_distributions?: number | null
          extracted_dpi?: number | null
          extracted_gross_irr?: number | null
          extracted_gross_tvpi?: number | null
          extracted_nav?: number | null
          extracted_net_irr?: number | null
          extracted_net_tvpi?: number | null
          extracted_pic?: number | null
          extracted_rvpi?: number | null
          extracted_unfunded?: number | null
          extraction_model?: string | null
          fund_id?: string
          id?: string
          quarter_date?: string
          raw_extraction?: Json | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_notes?: string | null
          source_file_name?: string | null
          source_file_path?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staged_fund_extractions_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
        ]
      }
      staged_internal_data: {
        Row: {
          body: string | null
          cashflow_amount: number | null
          cashflow_description: string | null
          cashflow_type: string | null
          created_at: string | null
          data_type: string
          entity_name: string | null
          id: string
          lp_nav: number | null
          nav_notes: string | null
          quarter_date: string
          reviewed_at: string | null
          reviewed_by: string | null
          reviewer_notes: string | null
          status: string
          submitted_by: string | null
          update_type: string | null
          updated_at: string | null
          url: string | null
        }
        Insert: {
          body?: string | null
          cashflow_amount?: number | null
          cashflow_description?: string | null
          cashflow_type?: string | null
          created_at?: string | null
          data_type: string
          entity_name?: string | null
          id?: string
          lp_nav?: number | null
          nav_notes?: string | null
          quarter_date: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_notes?: string | null
          status?: string
          submitted_by?: string | null
          update_type?: string | null
          updated_at?: string | null
          url?: string | null
        }
        Update: {
          body?: string | null
          cashflow_amount?: number | null
          cashflow_description?: string | null
          cashflow_type?: string | null
          created_at?: string | null
          data_type?: string
          entity_name?: string | null
          id?: string
          lp_nav?: number | null
          nav_notes?: string | null
          quarter_date?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_notes?: string | null
          status?: string
          submitted_by?: string | null
          update_type?: string | null
          updated_at?: string | null
          url?: string | null
        }
        Relationships: []
      }
      underlying_portfolio_holdings: {
        Row: {
          company_industries: string | null
          company_name: string
          created_at: string
          fmv: number
          fund_id: string | null
          id: string
          investment_cost: number
          notes: string | null
          proceeds: number
          quarter_date: string
          region: string | null
          sector: string | null
          target_industries: string | null
          theme: string | null
          twh_cost: number
          twh_fmv: number
          twh_proceeds: number
          type: string | null
        }
        Insert: {
          company_industries?: string | null
          company_name: string
          created_at?: string
          fmv?: number
          fund_id?: string | null
          id?: string
          investment_cost?: number
          notes?: string | null
          proceeds?: number
          quarter_date: string
          region?: string | null
          sector?: string | null
          target_industries?: string | null
          theme?: string | null
          twh_cost?: number
          twh_fmv?: number
          twh_proceeds?: number
          type?: string | null
        }
        Update: {
          company_industries?: string | null
          company_name?: string
          created_at?: string
          fmv?: number
          fund_id?: string | null
          id?: string
          investment_cost?: number
          notes?: string | null
          proceeds?: number
          quarter_date?: string
          region?: string | null
          sector?: string | null
          target_industries?: string | null
          theme?: string | null
          twh_cost?: number
          twh_fmv?: number
          twh_proceeds?: number
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "underlying_portfolio_holdings_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
        ]
      }
      underlying_portfolio_transactions: {
        Row: {
          company_name: string
          created_at: string
          fmv: number
          fund_name: string
          id: string
          instrument: string | null
          investment_cost: number
          proceeds: number
          quarter_date: string
          round: string | null
          status: string | null
          transaction_date: string | null
          twh_cost: number
          twh_fmv: number
          twh_pct: number
          twh_proceeds: number
        }
        Insert: {
          company_name: string
          created_at?: string
          fmv?: number
          fund_name: string
          id?: string
          instrument?: string | null
          investment_cost?: number
          proceeds?: number
          quarter_date: string
          round?: string | null
          status?: string | null
          transaction_date?: string | null
          twh_cost?: number
          twh_fmv?: number
          twh_pct?: number
          twh_proceeds?: number
        }
        Update: {
          company_name?: string
          created_at?: string
          fmv?: number
          fund_name?: string
          id?: string
          instrument?: string | null
          investment_cost?: number
          proceeds?: number
          quarter_date?: string
          round?: string | null
          status?: string | null
          transaction_date?: string | null
          twh_cost?: number
          twh_fmv?: number
          twh_pct?: number
          twh_proceeds?: number
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
