import type {ReconTables} from '../recon/model';
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: ReconTables & {
      findings: {
        Row: {
          affected_location: string | null
          created_at: string
          created_by: string | null
          cve: string | null
          cvss_score: number | null
          cvss_vector: string | null
          cwe: string | null
          description: string | null
          id: string
          impact: string | null
          local_reference: string | null
          project_id: string
          ref_id: string | null
          remediation: string | null
          report_status: Database["public"]["Enums"]["report_status"]
          report_url: string | null
          reported_on: string | null
          reproduction_steps: string | null
          resolved_at: string | null
          seq: number
          severity: Database["public"]["Enums"]["finding_severity"]
          source: Database["public"]["Enums"]["finding_source"]
          source_package: string | null
          source_rule_id: string | null
          source_target: string | null
          status: Database["public"]["Enums"]["finding_status"]
          title: string
          updated_at: string
          updated_by: string | null
          verification_status: Database["public"]["Enums"]["verification_status"]
        }
        Insert: {
          affected_location?: string | null
          created_at?: string
          created_by?: string | null
          cve?: string | null
          cvss_score?: number | null
          cvss_vector?: string | null
          cwe?: string | null
          description?: string | null
          id?: string
          impact?: string | null
          local_reference?: string | null
          project_id: string
          ref_id?: string | null
          remediation?: string | null
          report_status?: Database["public"]["Enums"]["report_status"]
          report_url?: string | null
          reported_on?: string | null
          reproduction_steps?: string | null
          resolved_at?: string | null
          seq?: number
          severity?: Database["public"]["Enums"]["finding_severity"]
          source?: Database["public"]["Enums"]["finding_source"]
          source_package?: string | null
          source_rule_id?: string | null
          source_target?: string | null
          status?: Database["public"]["Enums"]["finding_status"]
          title: string
          updated_at?: string
          updated_by?: string | null
          verification_status?: Database["public"]["Enums"]["verification_status"]
        }
        Update: {
          affected_location?: string | null
          created_at?: string
          created_by?: string | null
          cve?: string | null
          cvss_score?: number | null
          cvss_vector?: string | null
          cwe?: string | null
          description?: string | null
          id?: string
          impact?: string | null
          local_reference?: string | null
          project_id?: string
          ref_id?: string | null
          remediation?: string | null
          report_status?: Database["public"]["Enums"]["report_status"]
          report_url?: string | null
          reported_on?: string | null
          reproduction_steps?: string | null
          resolved_at?: string | null
          seq?: number
          severity?: Database["public"]["Enums"]["finding_severity"]
          source?: Database["public"]["Enums"]["finding_source"]
          source_package?: string | null
          source_rule_id?: string | null
          source_target?: string | null
          status?: Database["public"]["Enums"]["finding_status"]
          title?: string
          updated_at?: string
          updated_by?: string | null
          verification_status?: Database["public"]["Enums"]["verification_status"]
        }
        Relationships: [
          {
            foreignKeyName: "findings_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      members: {
        Row: {
          created_at: string
          created_by: string | null
          email: string
          is_active: boolean
          must_change_password: boolean
          role: Database["public"]["Enums"]["member_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email: string
          is_active?: boolean
          must_change_password?: boolean
          role?: Database["public"]["Enums"]["member_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string
          is_active?: boolean
          must_change_password?: boolean
          role?: Database["public"]["Enums"]["member_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          client: string | null
          created_at: string
          created_by: string | null
          end_date: string | null
          id: string
          kind: Database["public"]["Enums"]["project_kind"]
          name: string
          notes: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["project_status"]
          target: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          client?: string | null
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["project_kind"]
          name: string
          notes?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          target?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          client?: string | null
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["project_kind"]
          name?: string
          notes?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          target?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      import_recon_assets: { Args: {p_project_id:string;p_rows:Json;p_filename:string}; Returns:string }
      promote_recon_note: { Args: {p_note_id:string;p_title:string;p_severity:Database["public"]["Enums"]["finding_severity"]}; Returns:string }

      import_trivy_findings: {
        Args: { p_items: Json; p_project_id: string }
        Returns: {
          inserted: number
          skipped: number
          updated: number
        }[]
      }
    }
    Enums: {
      finding_severity: "critical" | "high" | "medium" | "low" | "info"
      finding_source: "manual" | "trivy"
      finding_status:
        | "open"
        | "in_progress"
        | "fix_verifying"
        | "resolved"
        | "risk_accepted"
        | "false_positive"
      member_role: "admin" | "member"
      project_kind: "oss_research" | "client_engagement" | "internal"
      project_status: "planning" | "active" | "completed"
      report_status:
        | "not_reported"
        | "reported"
        | "accepted"
        | "fixed"
        | "disclosed"
        | "not_applicable"
      verification_status: "unverified" | "code_confirmed" | "reproduced"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      finding_severity: ["critical", "high", "medium", "low", "info"],
      finding_source: ["manual", "trivy"],
      finding_status: [
        "open",
        "in_progress",
        "fix_verifying",
        "resolved",
        "risk_accepted",
        "false_positive",
      ],
      member_role: ["admin", "member"],
      project_kind: ["oss_research", "client_engagement", "internal"],
      project_status: ["planning", "active", "completed"],
      report_status: [
        "not_reported",
        "reported",
        "accepted",
        "fixed",
        "disclosed",
        "not_applicable",
      ],
      verification_status: ["unverified", "code_confirmed", "reproduced"],
    },
  },
} as const

