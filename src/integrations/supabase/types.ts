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
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          after: Json | null
          before: Json | null
          created_at: string
          entity: string
          entity_id: string | null
          id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: string
        }
        Relationships: []
      }
      cash_flows: {
        Row: {
          amount_usd: number
          category: string
          created_at: string
          created_by: string | null
          date: string
          direct_id: string | null
          fund_id: string | null
          id: string
          note: string | null
          scope: string
          source_document_id: string | null
        }
        Insert: {
          amount_usd: number
          category: string
          created_at?: string
          created_by?: string | null
          date: string
          direct_id?: string | null
          fund_id?: string | null
          id?: string
          note?: string | null
          scope: string
          source_document_id?: string | null
        }
        Update: {
          amount_usd?: number
          category?: string
          created_at?: string
          created_by?: string | null
          date?: string
          direct_id?: string | null
          fund_id?: string | null
          id?: string
          note?: string | null
          scope?: string
          source_document_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_flows_direct_id_fkey"
            columns: ["direct_id"]
            isOneToOne: false
            referencedRelation: "directs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_flows_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          challenges: string | null
          commentary_updated_at: string | null
          commentary_updated_by: string | null
          commercial_name: string | null
          created_at: string
          id: string
          industry: string[] | null
          legal_name: string
          notes: string | null
          region: string[] | null
          sdg: string[] | null
          stage: string | null
          status: string | null
          sub_industry: string[] | null
          tailwinds: string | null
          target_market: string | null
          theme: string[] | null
          thesis_bucket: string | null
          type: string[] | null
          updated_at: string
          url: string | null
          what_they_do: string | null
        }
        Insert: {
          challenges?: string | null
          commentary_updated_at?: string | null
          commentary_updated_by?: string | null
          commercial_name?: string | null
          created_at?: string
          id?: string
          industry?: string[] | null
          legal_name: string
          notes?: string | null
          region?: string[] | null
          sdg?: string[] | null
          stage?: string | null
          status?: string | null
          sub_industry?: string[] | null
          tailwinds?: string | null
          target_market?: string | null
          theme?: string[] | null
          thesis_bucket?: string | null
          type?: string[] | null
          updated_at?: string
          url?: string | null
          what_they_do?: string | null
        }
        Update: {
          challenges?: string | null
          commentary_updated_at?: string | null
          commentary_updated_by?: string | null
          commercial_name?: string | null
          created_at?: string
          id?: string
          industry?: string[] | null
          legal_name?: string
          notes?: string | null
          region?: string[] | null
          sdg?: string[] | null
          stage?: string | null
          status?: string | null
          sub_industry?: string[] | null
          tailwinds?: string | null
          target_market?: string | null
          theme?: string[] | null
          thesis_bucket?: string | null
          type?: string[] | null
          updated_at?: string
          url?: string | null
          what_they_do?: string | null
        }
        Relationships: []
      }
      computed_metrics: {
        Row: {
          computed_at: string
          direct_id: string | null
          dpi: number | null
          fund_id: string | null
          gross_irr: number | null
          gross_moic: number | null
          id: string
          net_irr: number | null
          net_tvpi: number | null
          quarter_id: string
          rvpi: number | null
          scope: string
        }
        Insert: {
          computed_at?: string
          direct_id?: string | null
          dpi?: number | null
          fund_id?: string | null
          gross_irr?: number | null
          gross_moic?: number | null
          id?: string
          net_irr?: number | null
          net_tvpi?: number | null
          quarter_id: string
          rvpi?: number | null
          scope: string
        }
        Update: {
          computed_at?: string
          direct_id?: string | null
          dpi?: number | null
          fund_id?: string | null
          gross_irr?: number | null
          gross_moic?: number | null
          id?: string
          net_irr?: number | null
          net_tvpi?: number | null
          quarter_id?: string
          rvpi?: number | null
          scope?: string
        }
        Relationships: [
          {
            foreignKeyName: "computed_metrics_direct_id_fkey"
            columns: ["direct_id"]
            isOneToOne: false
            referencedRelation: "directs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "computed_metrics_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "computed_metrics_quarter_id_fkey"
            columns: ["quarter_id"]
            isOneToOne: false
            referencedRelation: "quarters"
            referencedColumns: ["id"]
          },
        ]
      }
      direct_quarter_snapshots: {
        Row: {
          created_at: string
          direct_id: string
          id: string
          moic: number | null
          quarter_id: string
          source_report_id: string | null
          twh_fmv_usd: number
          twh_ownership_pct: number | null
          twh_proceeds_usd: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          direct_id: string
          id?: string
          moic?: number | null
          quarter_id: string
          source_report_id?: string | null
          twh_fmv_usd?: number
          twh_ownership_pct?: number | null
          twh_proceeds_usd?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          direct_id?: string
          id?: string
          moic?: number | null
          quarter_id?: string
          source_report_id?: string | null
          twh_fmv_usd?: number
          twh_ownership_pct?: number | null
          twh_proceeds_usd?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "direct_quarter_snapshots_direct_id_fkey"
            columns: ["direct_id"]
            isOneToOne: false
            referencedRelation: "directs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "direct_quarter_snapshots_quarter_id_fkey"
            columns: ["quarter_id"]
            isOneToOne: false
            referencedRelation: "quarters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "direct_quarter_snapshots_source_report_fk"
            columns: ["source_report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      directs: {
        Row: {
          co_investors: string[] | null
          company_id: string
          created_at: string
          id: string
          instrument: string | null
          investment_date: string | null
          note: string | null
          round: string | null
          round_detail: string | null
          twh_cost_usd: number
          updated_at: string
        }
        Insert: {
          co_investors?: string[] | null
          company_id: string
          created_at?: string
          id?: string
          instrument?: string | null
          investment_date?: string | null
          note?: string | null
          round?: string | null
          round_detail?: string | null
          twh_cost_usd?: number
          updated_at?: string
        }
        Update: {
          co_investors?: string[] | null
          company_id?: string
          created_at?: string
          id?: string
          instrument?: string | null
          investment_date?: string | null
          note?: string | null
          round?: string | null
          round_detail?: string | null
          twh_cost_usd?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "directs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      extraction_drafts: {
        Row: {
          confidence_notes: Json | null
          created_at: string
          error_message: string | null
          fund_id: string | null
          id: string
          normalized_payload: Json | null
          quarter_id: string | null
          raw_model_output: Json | null
          source_document_id: string
          source_type: string | null
          status: string
          updated_at: string
        }
        Insert: {
          confidence_notes?: Json | null
          created_at?: string
          error_message?: string | null
          fund_id?: string | null
          id?: string
          normalized_payload?: Json | null
          quarter_id?: string | null
          raw_model_output?: Json | null
          source_document_id: string
          source_type?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          confidence_notes?: Json | null
          created_at?: string
          error_message?: string | null
          fund_id?: string | null
          id?: string
          normalized_payload?: Json | null
          quarter_id?: string | null
          raw_model_output?: Json | null
          source_document_id?: string
          source_type?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "extraction_drafts_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "source_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      fund_commitments: {
        Row: {
          created_at: string
          fund_id: string
          id: string
          total_fund_commitment_usd: number
          twh_commitment_usd: number
          twh_ownership_pct: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          fund_id: string
          id?: string
          total_fund_commitment_usd?: number
          twh_commitment_usd?: number
          twh_ownership_pct?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          fund_id?: string
          id?: string
          total_fund_commitment_usd?: number
          twh_commitment_usd?: number
          twh_ownership_pct?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fund_commitments_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
        ]
      }
      fund_fx_rates: {
        Row: {
          created_at: string
          from_currency: string
          fund_id: string | null
          id: string
          quarter_id: string
          rate: number
          source: string
          to_currency: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          from_currency: string
          fund_id?: string | null
          id?: string
          quarter_id: string
          rate: number
          source?: string
          to_currency?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          from_currency?: string
          fund_id?: string | null
          id?: string
          quarter_id?: string
          rate?: number
          source?: string
          to_currency?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fund_fx_rates_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fund_fx_rates_quarter_id_fkey"
            columns: ["quarter_id"]
            isOneToOne: false
            referencedRelation: "quarters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fund_fx_rates_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fund_quarter_snapshots: {
        Row: {
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          currency: string
          dpi: number | null
          extracted_at: string | null
          fund_id: string
          fund_total_contributions_native: number | null
          fund_total_contributions_usd: number
          fund_total_distributions_native: number | null
          fund_total_distributions_usd: number | null
          fund_total_nav_native: number | null
          fund_total_nav_usd: number
          id: string
          irr: number | null
          moic: number | null
          quarter_id: string
          source_report_id: string | null
          tvpi: number | null
          twh_contributions_native: number | null
          twh_contributions_usd: number
          twh_distributions_native: number | null
          twh_distributions_usd: number
          twh_nav_native: number | null
          twh_nav_usd: number
          updated_at: string
        }
        Insert: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          currency?: string
          dpi?: number | null
          extracted_at?: string | null
          fund_id: string
          fund_total_contributions_native?: number | null
          fund_total_contributions_usd?: number
          fund_total_distributions_native?: number | null
          fund_total_distributions_usd?: number | null
          fund_total_nav_native?: number | null
          fund_total_nav_usd?: number
          id?: string
          irr?: number | null
          moic?: number | null
          quarter_id: string
          source_report_id?: string | null
          tvpi?: number | null
          twh_contributions_native?: number | null
          twh_contributions_usd?: number
          twh_distributions_native?: number | null
          twh_distributions_usd?: number
          twh_nav_native?: number | null
          twh_nav_usd?: number
          updated_at?: string
        }
        Update: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          currency?: string
          dpi?: number | null
          extracted_at?: string | null
          fund_id?: string
          fund_total_contributions_native?: number | null
          fund_total_contributions_usd?: number
          fund_total_distributions_native?: number | null
          fund_total_distributions_usd?: number | null
          fund_total_nav_native?: number | null
          fund_total_nav_usd?: number
          id?: string
          irr?: number | null
          moic?: number | null
          quarter_id?: string
          source_report_id?: string | null
          tvpi?: number | null
          twh_contributions_native?: number | null
          twh_contributions_usd?: number
          twh_distributions_native?: number | null
          twh_distributions_usd?: number
          twh_nav_native?: number | null
          twh_nav_usd?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fund_quarter_snapshots_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fund_quarter_snapshots_quarter_id_fkey"
            columns: ["quarter_id"]
            isOneToOne: false
            referencedRelation: "quarters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fund_quarter_snapshots_source_report_fk"
            columns: ["source_report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      funds: {
        Row: {
          archived: boolean
          created_at: string
          id: string
          name: string
          native_currency: string
          reporting_currency: string
          short_name: string | null
          start_date: string | null
          updated_at: string
        }
        Insert: {
          archived?: boolean
          created_at?: string
          id?: string
          name: string
          native_currency?: string
          reporting_currency?: string
          short_name?: string | null
          start_date?: string | null
          updated_at?: string
        }
        Update: {
          archived?: boolean
          created_at?: string
          id?: string
          name?: string
          native_currency?: string
          reporting_currency?: string
          short_name?: string | null
          start_date?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      fx_rates: {
        Row: {
          created_at: string
          currency: string
          date: string
          id: string
          note: string | null
          source: string | null
          usd_per_unit: number
        }
        Insert: {
          created_at?: string
          currency: string
          date: string
          id?: string
          note?: string | null
          source?: string | null
          usd_per_unit: number
        }
        Update: {
          created_at?: string
          currency?: string
          date?: string
          id?: string
          note?: string | null
          source?: string | null
          usd_per_unit?: number
        }
        Relationships: []
      }
      highlights: {
        Row: {
          body_md: string
          category: string
          created_at: string
          draft: boolean
          id: string
          last_edited_at: string
          last_edited_by: string | null
          position: number
          quarter_id: string
        }
        Insert: {
          body_md: string
          category: string
          created_at?: string
          draft?: boolean
          id?: string
          last_edited_at?: string
          last_edited_by?: string | null
          position?: number
          quarter_id: string
        }
        Update: {
          body_md?: string
          category?: string
          created_at?: string
          draft?: boolean
          id?: string
          last_edited_at?: string
          last_edited_by?: string | null
          position?: number
          quarter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "highlights_quarter_id_fkey"
            columns: ["quarter_id"]
            isOneToOne: false
            referencedRelation: "quarters"
            referencedColumns: ["id"]
          },
        ]
      }
      investor_quarter_snapshots: {
        Row: {
          contribution_amount: number
          contribution_date: string | null
          created_at: string
          distribution_amount: number
          distribution_date: string | null
          id: string
          investor_id: string
          nav_amount: number
          notes: string | null
          quarter_id: string
          updated_at: string
        }
        Insert: {
          contribution_amount?: number
          contribution_date?: string | null
          created_at?: string
          distribution_amount?: number
          distribution_date?: string | null
          id?: string
          investor_id: string
          nav_amount?: number
          notes?: string | null
          quarter_id: string
          updated_at?: string
        }
        Update: {
          contribution_amount?: number
          contribution_date?: string | null
          created_at?: string
          distribution_amount?: number
          distribution_date?: string | null
          id?: string
          investor_id?: string
          nav_amount?: number
          notes?: string | null
          quarter_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "investor_quarter_snapshots_investor_id_fkey"
            columns: ["investor_id"]
            isOneToOne: false
            referencedRelation: "investors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investor_quarter_snapshots_quarter_id_fkey"
            columns: ["quarter_id"]
            isOneToOne: false
            referencedRelation: "quarters"
            referencedColumns: ["id"]
          },
        ]
      }
      investors: {
        Row: {
          commitment_amount: number | null
          commitment_date: string | null
          created_at: string
          id: string
          name: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          commitment_amount?: number | null
          commitment_date?: string | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          commitment_amount?: number | null
          commitment_date?: string | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      quarter_share_tokens: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          quarter_id: string
          revoked: boolean
          token: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          quarter_id: string
          revoked?: boolean
          token: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          quarter_id?: string
          revoked?: boolean
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "quarter_share_tokens_quarter_id_fkey"
            columns: ["quarter_id"]
            isOneToOne: false
            referencedRelation: "quarters"
            referencedColumns: ["id"]
          },
        ]
      }
      quarters: {
        Row: {
          created_at: string
          fiscal_quarter: number
          fiscal_year: number
          id: string
          label: string
          locked_at: string | null
          quarter_end_date: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          fiscal_quarter: number
          fiscal_year: number
          id?: string
          label: string
          locked_at?: string | null
          quarter_end_date: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          fiscal_quarter?: number
          fiscal_year?: number
          id?: string
          label?: string
          locked_at?: string | null
          quarter_end_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          archived: boolean
          archived_at: string | null
          committed_at: string | null
          committed_by: string | null
          committed_to_db: boolean
          created_at: string
          extracted_payload: Json | null
          extraction_status: Database["public"]["Enums"]["report_extraction_status"]
          extraction_summary: Json | null
          file_name: string
          file_size_bytes: number | null
          fund_id: string | null
          id: string
          mime_type: string | null
          notes: string | null
          quarter_id: string | null
          storage_path: string
          updated_at: string
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          archived?: boolean
          archived_at?: string | null
          committed_at?: string | null
          committed_by?: string | null
          committed_to_db?: boolean
          created_at?: string
          extracted_payload?: Json | null
          extraction_status?: Database["public"]["Enums"]["report_extraction_status"]
          extraction_summary?: Json | null
          file_name: string
          file_size_bytes?: number | null
          fund_id?: string | null
          id?: string
          mime_type?: string | null
          notes?: string | null
          quarter_id?: string | null
          storage_path: string
          updated_at?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          archived?: boolean
          archived_at?: string | null
          committed_at?: string | null
          committed_by?: string | null
          committed_to_db?: boolean
          created_at?: string
          extracted_payload?: Json | null
          extraction_status?: Database["public"]["Enums"]["report_extraction_status"]
          extraction_summary?: Json | null
          file_name?: string
          file_size_bytes?: number | null
          fund_id?: string | null
          id?: string
          mime_type?: string | null
          notes?: string | null
          quarter_id?: string | null
          storage_path?: string
          updated_at?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reports_committed_by_fkey"
            columns: ["committed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_quarter_id_fkey"
            columns: ["quarter_id"]
            isOneToOne: false
            referencedRelation: "quarters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      source_documents: {
        Row: {
          direct_id: string | null
          doc_type: string
          fund_id: string | null
          id: string
          original_filename: string | null
          quarter_id: string | null
          status: string
          storage_path: string
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          direct_id?: string | null
          doc_type: string
          fund_id?: string | null
          id?: string
          original_filename?: string | null
          quarter_id?: string | null
          status?: string
          storage_path: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          direct_id?: string | null
          doc_type?: string
          fund_id?: string | null
          id?: string
          original_filename?: string | null
          quarter_id?: string | null
          status?: string
          storage_path?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "source_documents_direct_id_fkey"
            columns: ["direct_id"]
            isOneToOne: false
            referencedRelation: "directs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_documents_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_documents_quarter_id_fkey"
            columns: ["quarter_id"]
            isOneToOne: false
            referencedRelation: "quarters"
            referencedColumns: ["id"]
          },
        ]
      }
      taxonomy_items: {
        Row: {
          archived: boolean
          created_at: string
          id: string
          kind: string
          sort_order: number
          value: string
        }
        Insert: {
          archived?: boolean
          created_at?: string
          id?: string
          kind: string
          sort_order?: number
          value: string
        }
        Update: {
          archived?: boolean
          created_at?: string
          id?: string
          kind?: string
          sort_order?: number
          value?: string
        }
        Relationships: []
      }
      twh_ledger_entries: {
        Row: {
          amount_usd: number
          category: string
          counterparty: string | null
          created_at: string
          created_by: string | null
          date: string
          description: string | null
          id: string
          reconciled: boolean
          source_document_id: string | null
        }
        Insert: {
          amount_usd: number
          category: string
          counterparty?: string | null
          created_at?: string
          created_by?: string | null
          date: string
          description?: string | null
          id?: string
          reconciled?: boolean
          source_document_id?: string | null
        }
        Update: {
          amount_usd?: number
          category?: string
          counterparty?: string | null
          created_at?: string
          created_by?: string | null
          date?: string
          description?: string | null
          id?: string
          reconciled?: boolean
          source_document_id?: string | null
        }
        Relationships: []
      }
      underlying_holdings: {
        Row: {
          company_id: string
          created_at: string
          currency: string
          fund_cost_native: number | null
          fund_cost_usd: number | null
          fund_fmv_native: number | null
          fund_fmv_usd: number | null
          fund_id: string
          fund_proceeds_native: number | null
          fund_proceeds_usd: number | null
          id: string
          instrument: string | null
          investment_date: string | null
          moic: number | null
          quarter_id: string
          round: string | null
          round_detail: string | null
          source_report_id: string | null
          tranche_seq: number
          twh_cost_native: number | null
          twh_cost_usd: number | null
          twh_fmv_native: number | null
          twh_fmv_usd: number | null
          twh_ownership_pct: number | null
          twh_proceeds_native: number | null
          twh_proceeds_usd: number | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          currency?: string
          fund_cost_native?: number | null
          fund_cost_usd?: number | null
          fund_fmv_native?: number | null
          fund_fmv_usd?: number | null
          fund_id: string
          fund_proceeds_native?: number | null
          fund_proceeds_usd?: number | null
          id?: string
          instrument?: string | null
          investment_date?: string | null
          moic?: number | null
          quarter_id: string
          round?: string | null
          round_detail?: string | null
          source_report_id?: string | null
          tranche_seq?: number
          twh_cost_native?: number | null
          twh_cost_usd?: number | null
          twh_fmv_native?: number | null
          twh_fmv_usd?: number | null
          twh_ownership_pct?: number | null
          twh_proceeds_native?: number | null
          twh_proceeds_usd?: number | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          currency?: string
          fund_cost_native?: number | null
          fund_cost_usd?: number | null
          fund_fmv_native?: number | null
          fund_fmv_usd?: number | null
          fund_id?: string
          fund_proceeds_native?: number | null
          fund_proceeds_usd?: number | null
          id?: string
          instrument?: string | null
          investment_date?: string | null
          moic?: number | null
          quarter_id?: string
          round?: string | null
          round_detail?: string | null
          source_report_id?: string | null
          tranche_seq?: number
          twh_cost_native?: number | null
          twh_cost_usd?: number | null
          twh_fmv_native?: number | null
          twh_fmv_usd?: number | null
          twh_ownership_pct?: number | null
          twh_proceeds_native?: number | null
          twh_proceeds_usd?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "underlying_holdings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "underlying_holdings_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "underlying_holdings_quarter_id_fkey"
            columns: ["quarter_id"]
            isOneToOne: false
            referencedRelation: "quarters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "underlying_holdings_source_report_fk"
            columns: ["source_report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      compute_quarter_metrics: {
        Args: { _quarter_id: string }
        Returns: undefined
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      lookup_fund_fx_rate: {
        Args: { _from_currency: string; _fund_id: string; _quarter_id: string }
        Returns: number
      }
      normalize_round_name: {
        Args: { _raw: string }
        Returns: {
          instrument_extracted: string
          round: string
          round_detail: string
        }[]
      }
      xirr: { Args: { _amounts: number[]; _dates: string[] }; Returns: number }
    }
    Enums: {
      app_role: "admin" | "viewer"
      report_extraction_status: "pending" | "success" | "error" | "needs_review"
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
    Enums: {
      app_role: ["admin", "viewer"],
      report_extraction_status: ["pending", "success", "error", "needs_review"],
    },
  },
} as const
