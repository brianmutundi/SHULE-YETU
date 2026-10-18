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
    PostgrestVersion: "14.18"
  }
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
    Tables: {
      academic_years: {
        Row: {
          calendar_year: number
          created_at: string
          ends_on: string
          id: string
          is_current: boolean
          starts_on: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          calendar_year: number
          created_at?: string
          ends_on: string
          id?: string
          is_current?: boolean
          starts_on: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          calendar_year?: number
          created_at?: string
          ends_on?: string
          id?: string
          is_current?: boolean
          starts_on?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_years_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      classes: {
        Row: {
          created_at: string
          id: string
          label: string
          level_id: string
          next_class_id: string | null
          sort_order: number
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          level_id: string
          next_class_id?: string | null
          sort_order: number
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          level_id?: string
          next_class_id?: string | null
          sort_order?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "classes_level_id_fkey"
            columns: ["level_id"]
            isOneToOne: false
            referencedRelation: "levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classes_next_class_id_fkey"
            columns: ["next_class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      guardians: {
        Row: {
          absence_reason: string | null
          address: string | null
          created_at: string
          deleted_at: string | null
          email: string | null
          full_name: string
          id: string
          is_deceased: boolean
          national_id: string | null
          occupation: string | null
          occupation_category: string | null
          phone: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          absence_reason?: string | null
          address?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          full_name: string
          id?: string
          is_deceased?: boolean
          national_id?: string | null
          occupation?: string | null
          occupation_category?: string | null
          phone: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          absence_reason?: string | null
          address?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          full_name?: string
          id?: string
          is_deceased?: boolean
          national_id?: string | null
          occupation?: string | null
          occupation_category?: string | null
          phone?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "guardians_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      levels: {
        Row: {
          created_at: string
          id: string
          name: string
          sort_order: number
          stage: Database["public"]["Enums"]["level_stage"]
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          sort_order: number
          stage: Database["public"]["Enums"]["level_stage"]
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
          stage?: Database["public"]["Enums"]["level_stage"]
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "levels_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          academic_year_id: string
          closing_on: string
          created_at: string
          id: string
          midterm_break_on: string | null
          name: string
          opened_on: string
          status: string
          tenant_id: string
          term_number: number
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          closing_on: string
          created_at?: string
          id?: string
          midterm_break_on?: string | null
          name: string
          opened_on: string
          status?: string
          tenant_id: string
          term_number: number
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          closing_on?: string
          created_at?: string
          id?: string
          midterm_break_on?: string | null
          name?: string
          opened_on?: string
          status?: string
          tenant_id?: string
          term_number?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      streams: {
        Row: {
          academic_year_id: string
          class_id: string
          created_at: string
          full_name: string
          id: string
          stream_label: string
          tenant_id: string
        }
        Insert: {
          academic_year_id: string
          class_id: string
          created_at?: string
          full_name: string
          id?: string
          stream_label: string
          tenant_id: string
        }
        Update: {
          academic_year_id?: string
          class_id?: string
          created_at?: string
          full_name?: string
          id?: string
          stream_label?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "streams_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "streams_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      student_counters: {
        Row: {
          next_value: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          next_value?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          next_value?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_counters_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      student_guardians: {
        Row: {
          created_at: string
          guardian_id: string
          is_emergency_contact: boolean
          is_fee_payer: boolean
          is_primary: boolean
          relationship: Database["public"]["Enums"]["guardian_relationship"]
          student_id: string
        }
        Insert: {
          created_at?: string
          guardian_id: string
          is_emergency_contact?: boolean
          is_fee_payer?: boolean
          is_primary?: boolean
          relationship?: Database["public"]["Enums"]["guardian_relationship"]
          student_id: string
        }
        Update: {
          created_at?: string
          guardian_id?: string
          is_emergency_contact?: boolean
          is_fee_payer?: boolean
          is_primary?: boolean
          relationship?: Database["public"]["Enums"]["guardian_relationship"]
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_guardians_guardian_id_fkey"
            columns: ["guardian_id"]
            isOneToOne: false
            referencedRelation: "guardians"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_guardians_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          address: string | null
          admitted_class_id: string | null
          admitted_on: string | null
          admitted_session_id: string | null
          assessment_number: string | null
          birth_cert_no: string | null
          county: string | null
          created_at: string
          current_stream_id: string | null
          date_of_birth: string
          deleted_at: string | null
          destination_school: string | null
          email: string | null
          first_name: string
          gender: Database["public"]["Enums"]["student_gender"]
          house: string | null
          id: string
          nationality: string | null
          orphan_status: Database["public"]["Enums"]["orphan_status"]
          other_names: string | null
          pathway_id: string | null
          phone: string | null
          photo_url: string | null
          previous_school: string | null
          religion: string | null
          special_needs_category: string | null
          special_needs_notes: string | null
          status: Database["public"]["Enums"]["student_status"]
          student_no: string
          sub_county: string | null
          surname: string | null
          tenant_id: string
          track: string | null
          transfer_reason: string | null
          tuition_waiver: boolean
          updated_at: string
          upi: string | null
        }
        Insert: {
          address?: string | null
          admitted_class_id?: string | null
          admitted_on?: string | null
          admitted_session_id?: string | null
          assessment_number?: string | null
          birth_cert_no?: string | null
          county?: string | null
          created_at?: string
          current_stream_id?: string | null
          date_of_birth: string
          deleted_at?: string | null
          destination_school?: string | null
          email?: string | null
          first_name: string
          gender: Database["public"]["Enums"]["student_gender"]
          house?: string | null
          id?: string
          nationality?: string | null
          orphan_status?: Database["public"]["Enums"]["orphan_status"]
          other_names?: string | null
          pathway_id?: string | null
          phone?: string | null
          photo_url?: string | null
          previous_school?: string | null
          religion?: string | null
          special_needs_category?: string | null
          special_needs_notes?: string | null
          status?: Database["public"]["Enums"]["student_status"]
          student_no: string
          sub_county?: string | null
          surname?: string | null
          tenant_id: string
          track?: string | null
          transfer_reason?: string | null
          tuition_waiver?: boolean
          updated_at?: string
          upi?: string | null
        }
        Update: {
          address?: string | null
          admitted_class_id?: string | null
          admitted_on?: string | null
          admitted_session_id?: string | null
          assessment_number?: string | null
          birth_cert_no?: string | null
          county?: string | null
          created_at?: string
          current_stream_id?: string | null
          date_of_birth?: string
          deleted_at?: string | null
          destination_school?: string | null
          email?: string | null
          first_name?: string
          gender?: Database["public"]["Enums"]["student_gender"]
          house?: string | null
          id?: string
          nationality?: string | null
          orphan_status?: Database["public"]["Enums"]["orphan_status"]
          other_names?: string | null
          pathway_id?: string | null
          phone?: string | null
          photo_url?: string | null
          previous_school?: string | null
          religion?: string | null
          special_needs_category?: string | null
          special_needs_notes?: string | null
          status?: Database["public"]["Enums"]["student_status"]
          student_no?: string
          sub_county?: string | null
          surname?: string | null
          tenant_id?: string
          track?: string | null
          transfer_reason?: string | null
          tuition_waiver?: boolean
          updated_at?: string
          upi?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "students_admitted_class_id_fkey"
            columns: ["admitted_class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_admitted_session_id_fkey"
            columns: ["admitted_session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_current_stream_id_fkey"
            columns: ["current_stream_id"]
            isOneToOne: false
            referencedRelation: "streams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          boarding_mode: Database["public"]["Enums"]["boarding_mode"]
          capitation_enabled: boolean
          county: string | null
          created_at: string
          created_by: string | null
          currency: string
          gender: Database["public"]["Enums"]["gender_type"]
          id: string
          knec_center_code: string | null
          logo_url: string | null
          name: string
          operating_mode: Database["public"]["Enums"]["operating_mode"] | null
          ownership: Database["public"]["Enums"]["ownership_type"]
          school_code: string | null
          school_type: Database["public"]["Enums"]["school_type"]
          settings: Json
          sponsor: string | null
          student_no_prefix: string
          sub_county: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          boarding_mode?: Database["public"]["Enums"]["boarding_mode"]
          capitation_enabled?: boolean
          county?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          gender?: Database["public"]["Enums"]["gender_type"]
          id?: string
          knec_center_code?: string | null
          logo_url?: string | null
          name: string
          operating_mode?: Database["public"]["Enums"]["operating_mode"] | null
          ownership?: Database["public"]["Enums"]["ownership_type"]
          school_code?: string | null
          school_type: Database["public"]["Enums"]["school_type"]
          settings?: Json
          sponsor?: string | null
          student_no_prefix?: string
          sub_county?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          boarding_mode?: Database["public"]["Enums"]["boarding_mode"]
          capitation_enabled?: boolean
          county?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          gender?: Database["public"]["Enums"]["gender_type"]
          id?: string
          knec_center_code?: string | null
          logo_url?: string | null
          name?: string
          operating_mode?: Database["public"]["Enums"]["operating_mode"] | null
          ownership?: Database["public"]["Enums"]["ownership_type"]
          school_code?: string | null
          school_type?: Database["public"]["Enums"]["school_type"]
          settings?: Json
          sponsor?: string | null
          student_no_prefix?: string
          sub_county?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_tenant: { Args: { p_tenant: string }; Returns: string }
      clone_streams: {
        Args: { p_from_year: string; p_replace?: boolean; p_to_year: string }
        Returns: number
      }
      ensure_streams: {
        Args: { p_labels?: string[]; p_tenant: string; p_year: string }
        Returns: number
      }
      next_student_no: { Args: { p_tenant: string }; Returns: string }
      student_directory_stats: { Args: never; Returns: Json }
    }
    Enums: {
      app_role:
        | "owner"
        | "admin"
        | "registrar"
        | "teacher"
        | "finance"
        | "viewer"
        | "head_teacher"
        | "deputy_head"
        | "bursar"
        | "class_teacher"
        | "subject_teacher"
        | "parent"
      boarding_mode: "day" | "boarding" | "mixed"
      gender_type: "boys" | "girls" | "mixed"
      guardian_relationship:
        | "parent"
        | "grandparent"
        | "sibling"
        | "aunt_uncle"
        | "relative"
        | "guardian"
        | "other"
      level_stage:
        | "pre_primary"
        | "lower_primary"
        | "upper_primary"
        | "junior_school"
        | "senior_school"
      operating_mode: "basic" | "senior"
      orphan_status:
        | "none"
        | "one_parent_deceased"
        | "both_deceased"
        | "unknown"
      ownership_type: "public" | "private"
      school_type: "primary" | "junior" | "primary_junior" | "senior"
      student_gender: "male" | "female"
      student_status:
        | "draft"
        | "active"
        | "inactive"
        | "completed"
        | "graduated"
        | "transferred"
        | "withdrawn"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: [
        "owner",
        "admin",
        "registrar",
        "teacher",
        "finance",
        "viewer",
        "head_teacher",
        "deputy_head",
        "bursar",
        "class_teacher",
        "subject_teacher",
        "parent",
      ],
      boarding_mode: ["day", "boarding", "mixed"],
      gender_type: ["boys", "girls", "mixed"],
      guardian_relationship: [
        "parent",
        "grandparent",
        "sibling",
        "aunt_uncle",
        "relative",
        "guardian",
        "other",
      ],
      level_stage: [
        "pre_primary",
        "lower_primary",
        "upper_primary",
        "junior_school",
        "senior_school",
      ],
      operating_mode: ["basic", "senior"],
      orphan_status: [
        "none",
        "one_parent_deceased",
        "both_deceased",
        "unknown",
      ],
      ownership_type: ["public", "private"],
      school_type: ["primary", "junior", "primary_junior", "senior"],
      student_gender: ["male", "female"],
      student_status: [
        "draft",
        "active",
        "inactive",
        "completed",
        "graduated",
        "transferred",
        "withdrawn",
      ],
    },
  },
} as const
