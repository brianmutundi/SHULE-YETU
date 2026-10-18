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
      attendance_records: {
        Row: {
          date: string
          excuse_reason: Database["public"]["Enums"]["excuse_reason"] | null
          id: string
          marked_at: string
          marked_by: string | null
          note: string | null
          session_id: string | null
          status: Database["public"]["Enums"]["attendance_status"]
          stream_id: string | null
          student_id: string
          tenant_id: string
        }
        Insert: {
          date: string
          excuse_reason?: Database["public"]["Enums"]["excuse_reason"] | null
          id?: string
          marked_at?: string
          marked_by?: string | null
          note?: string | null
          session_id?: string | null
          status: Database["public"]["Enums"]["attendance_status"]
          stream_id?: string | null
          student_id: string
          tenant_id: string
        }
        Update: {
          date?: string
          excuse_reason?: Database["public"]["Enums"]["excuse_reason"] | null
          id?: string
          marked_at?: string
          marked_by?: string | null
          note?: string | null
          session_id?: string | null
          status?: Database["public"]["Enums"]["attendance_status"]
          stream_id?: string | null
          student_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_marked_by_fkey"
            columns: ["marked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_stream_id_fkey"
            columns: ["stream_id"]
            isOneToOne: false
            referencedRelation: "streams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          created_at: string
          details: Json
          entity_id: string | null
          entity_type: string
          id: string
          tenant_id: string
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          details?: Json
          entity_id?: string | null
          entity_type: string
          id?: string
          tenant_id: string
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          details?: Json
          entity_id?: string | null
          entity_type?: string
          id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      checkpoint_results: {
        Row: {
          academic_year_id: string
          checkpoint: string
          created_at: string
          id: string
          recorded_at: string | null
          recorded_by: string | null
          released_at: string | null
          score: number | null
          status: string
          student_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          checkpoint: string
          created_at?: string
          id?: string
          recorded_at?: string | null
          recorded_by?: string | null
          released_at?: string | null
          score?: number | null
          status?: string
          student_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          checkpoint?: string
          created_at?: string
          id?: string
          recorded_at?: string | null
          recorded_by?: string | null
          released_at?: string | null
          score?: number | null
          status?: string
          student_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkpoint_results_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkpoint_results_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkpoint_results_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkpoint_results_tenant_id_fkey"
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
      import_batch_rows: {
        Row: {
          batch_id: string
          created_at: string
          errors: Json
          id: string
          payload: Json
          row_number: number
          status: string
          student_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          batch_id: string
          created_at?: string
          errors?: Json
          id?: string
          payload: Json
          row_number: number
          status?: string
          student_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          batch_id?: string
          created_at?: string
          errors?: Json
          id?: string
          payload?: Json
          row_number?: number
          status?: string
          student_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_batch_rows_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_batch_rows_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_batch_rows_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      import_batches: {
        Row: {
          academic_year_id: string
          completed_at: string | null
          created_at: string
          failed_rows: number
          file_name: string
          id: string
          imported_rows: number
          operating_mode: Database["public"]["Enums"]["operating_mode"]
          status: string
          tenant_id: string
          total_rows: number
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          academic_year_id: string
          completed_at?: string | null
          created_at?: string
          failed_rows?: number
          file_name: string
          id?: string
          imported_rows?: number
          operating_mode: Database["public"]["Enums"]["operating_mode"]
          status?: string
          tenant_id: string
          total_rows?: number
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          academic_year_id?: string
          completed_at?: string | null
          created_at?: string
          failed_rows?: number
          file_name?: string
          id?: string
          imported_rows?: number
          operating_mode?: Database["public"]["Enums"]["operating_mode"]
          status?: string
          tenant_id?: string
          total_rows?: number
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "import_batches_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_batches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_batches_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_areas: {
        Row: {
          created_at: string
          id: string
          name: string
          sort_order: number
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          sort_order?: number
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_areas_tenant_id_fkey"
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
      pathway_subjects: {
        Row: {
          id: string
          pathway_id: string
          requirement: string
          subject_id: string
          tenant_id: string
        }
        Insert: {
          id?: string
          pathway_id: string
          requirement?: string
          subject_id: string
          tenant_id: string
        }
        Update: {
          id?: string
          pathway_id?: string
          requirement?: string
          subject_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pathway_subjects_pathway_id_fkey"
            columns: ["pathway_id"]
            isOneToOne: false
            referencedRelation: "pathways"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pathway_subjects_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pathway_subjects_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pathways: {
        Row: {
          code: string
          id: string
          name: string
          sort_order: number
          tenant_id: string
        }
        Insert: {
          code: string
          id?: string
          name: string
          sort_order?: number
          tenant_id: string
        }
        Update: {
          code?: string
          id?: string
          name?: string
          sort_order?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pathways_tenant_id_fkey"
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
      promotion_run_items: {
        Row: {
          created_at: string
          from_class_id: string | null
          from_status: Database["public"]["Enums"]["student_status"] | null
          from_stream_id: string | null
          id: string
          outcome: string
          reason: string | null
          run_id: string
          student_id: string
          tenant_id: string
          to_status: Database["public"]["Enums"]["student_status"] | null
          to_stream_id: string | null
        }
        Insert: {
          created_at?: string
          from_class_id?: string | null
          from_status?: Database["public"]["Enums"]["student_status"] | null
          from_stream_id?: string | null
          id?: string
          outcome: string
          reason?: string | null
          run_id: string
          student_id: string
          tenant_id: string
          to_status?: Database["public"]["Enums"]["student_status"] | null
          to_stream_id?: string | null
        }
        Update: {
          created_at?: string
          from_class_id?: string | null
          from_status?: Database["public"]["Enums"]["student_status"] | null
          from_stream_id?: string | null
          id?: string
          outcome?: string
          reason?: string | null
          run_id?: string
          student_id?: string
          tenant_id?: string
          to_status?: Database["public"]["Enums"]["student_status"] | null
          to_stream_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promotion_run_items_from_class_id_fkey"
            columns: ["from_class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_run_items_from_stream_id_fkey"
            columns: ["from_stream_id"]
            isOneToOne: false
            referencedRelation: "streams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_run_items_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "promotion_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_run_items_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_run_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_run_items_to_stream_id_fkey"
            columns: ["to_stream_id"]
            isOneToOne: false
            referencedRelation: "streams"
            referencedColumns: ["id"]
          },
        ]
      }
      promotion_runs: {
        Row: {
          completed_count: number
          created_at: string
          failed_count: number
          from_session_id: string
          from_year_id: string
          graduated_count: number
          held_count: number
          id: string
          note: string | null
          promoted_count: number
          rolled_back_at: string | null
          started_by: string | null
          status: string
          stream_strategy: string
          summary: Json
          tenant_id: string
          to_year_id: string
          total_students: number
          updated_at: string
        }
        Insert: {
          completed_count?: number
          created_at?: string
          failed_count?: number
          from_session_id: string
          from_year_id: string
          graduated_count?: number
          held_count?: number
          id?: string
          note?: string | null
          promoted_count?: number
          rolled_back_at?: string | null
          started_by?: string | null
          status?: string
          stream_strategy?: string
          summary?: Json
          tenant_id: string
          to_year_id: string
          total_students?: number
          updated_at?: string
        }
        Update: {
          completed_count?: number
          created_at?: string
          failed_count?: number
          from_session_id?: string
          from_year_id?: string
          graduated_count?: number
          held_count?: number
          id?: string
          note?: string | null
          promoted_count?: number
          rolled_back_at?: string | null
          started_by?: string | null
          status?: string
          stream_strategy?: string
          summary?: Json
          tenant_id?: string
          to_year_id?: string
          total_students?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "promotion_runs_from_session_id_fkey"
            columns: ["from_session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_runs_from_year_id_fkey"
            columns: ["from_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_runs_started_by_fkey"
            columns: ["started_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_runs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_runs_to_year_id_fkey"
            columns: ["to_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
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
      staff: {
        Row: {
          address: string | null
          created_at: string
          deleted_at: string | null
          email: string | null
          employer: string
          employment_type: string | null
          full_name: string
          gender: Database["public"]["Enums"]["student_gender"] | null
          hired_on: string | null
          id: string
          phone: string | null
          profile_id: string | null
          staff_type: string
          status: string
          tenant_id: string
          tsc_number: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          employer?: string
          employment_type?: string | null
          full_name: string
          gender?: Database["public"]["Enums"]["student_gender"] | null
          hired_on?: string | null
          id?: string
          phone?: string | null
          profile_id?: string | null
          staff_type?: string
          status?: string
          tenant_id: string
          tsc_number?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          employer?: string
          employment_type?: string | null
          full_name?: string
          gender?: Database["public"]["Enums"]["student_gender"] | null
          hired_on?: string | null
          id?: string
          phone?: string | null
          profile_id?: string | null
          staff_type?: string
          status?: string
          tenant_id?: string
          tsc_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_sensitive: {
        Row: {
          kra_pin: string | null
          national_id: string | null
          nssf_sha_number: string | null
          staff_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          kra_pin?: string | null
          national_id?: string | null
          nssf_sha_number?: string | null
          staff_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          kra_pin?: string | null
          national_id?: string | null
          nssf_sha_number?: string | null
          staff_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_sensitive_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: true
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_sensitive_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: true
            referencedRelation: "staff_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_sensitive_tenant_id_fkey"
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
      student_consents: {
        Row: {
          consent_kind: string
          granted: boolean
          granted_at: string
          granted_by: string | null
          id: string
          lawful_basis: string
          student_id: string
          tenant_id: string
        }
        Insert: {
          consent_kind: string
          granted: boolean
          granted_at?: string
          granted_by?: string | null
          id?: string
          lawful_basis?: string
          student_id: string
          tenant_id: string
        }
        Update: {
          consent_kind?: string
          granted?: boolean
          granted_at?: string
          granted_by?: string | null
          id?: string
          lawful_basis?: string
          student_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_consents_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_consents_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_consents_tenant_id_fkey"
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
      student_documents: {
        Row: {
          created_at: string
          id: string
          kind: string
          storage_path: string
          student_id: string
          tenant_id: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          storage_path: string
          student_id: string
          tenant_id: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          storage_path?: string
          student_id?: string
          tenant_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_documents_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      student_logistics: {
        Row: {
          boarding_status: string | null
          student_id: string
          tenant_id: string
          transport_mode: string | null
          transport_route: string | null
          updated_at: string
        }
        Insert: {
          boarding_status?: string | null
          student_id: string
          tenant_id: string
          transport_mode?: string | null
          transport_route?: string | null
          updated_at?: string
        }
        Update: {
          boarding_status?: string | null
          student_id?: string
          tenant_id?: string
          transport_mode?: string | null
          transport_route?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_logistics_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: true
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_logistics_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      student_medical: {
        Row: {
          allergies: string | null
          blood_group: string | null
          challenges: string | null
          conditions: string | null
          emergency_contact: string | null
          strengths: string | null
          student_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          allergies?: string | null
          blood_group?: string | null
          challenges?: string | null
          conditions?: string | null
          emergency_contact?: string | null
          strengths?: string | null
          student_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          allergies?: string | null
          blood_group?: string | null
          challenges?: string | null
          conditions?: string | null
          emergency_contact?: string | null
          strengths?: string | null
          student_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_medical_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: true
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_medical_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      student_subjects: {
        Row: {
          chosen_by: string | null
          selection_cutoff_at: string | null
          student_id: string
          subject_id: string
        }
        Insert: {
          chosen_by?: string | null
          selection_cutoff_at?: string | null
          student_id: string
          subject_id: string
        }
        Update: {
          chosen_by?: string | null
          selection_cutoff_at?: string | null
          student_id?: string
          subject_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_subjects_chosen_by_fkey"
            columns: ["chosen_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_subjects_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_subjects_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
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
      subjects: {
        Row: {
          code: string
          id: string
          is_core: boolean
          name: string
          tenant_id: string
        }
        Insert: {
          code: string
          id?: string
          is_core?: boolean
          name: string
          tenant_id: string
        }
        Update: {
          code?: string
          id?: string
          is_core?: boolean
          name?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subjects_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      teaching_assignments: {
        Row: {
          academic_year_id: string
          class_id: string | null
          created_at: string
          id: string
          learning_area_id: string | null
          scope: string
          staff_id: string
          stream_id: string | null
          subject_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          class_id?: string | null
          created_at?: string
          id?: string
          learning_area_id?: string | null
          scope: string
          staff_id: string
          stream_id?: string | null
          subject_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          class_id?: string | null
          created_at?: string
          id?: string
          learning_area_id?: string | null
          scope?: string
          staff_id?: string
          stream_id?: string | null
          subject_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teaching_assignments_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teaching_assignments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teaching_assignments_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teaching_assignments_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teaching_assignments_stream_id_fkey"
            columns: ["stream_id"]
            isOneToOne: false
            referencedRelation: "streams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teaching_assignments_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teaching_assignments_tenant_id_fkey"
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
      staff_directory: {
        Row: {
          address: string | null
          assignments: Json | null
          email: string | null
          employer: string | null
          employment_type: string | null
          full_name: string | null
          gender: Database["public"]["Enums"]["student_gender"] | null
          hired_on: string | null
          id: string | null
          kra_pin: string | null
          national_id: string | null
          nssf_sha_number: string | null
          phone: string | null
          profile_id: string | null
          staff_type: string | null
          status: string | null
          tenant_id: string | null
          tsc_number: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      add_student_guardian: {
        Args: { p_guardian: Json; p_student: string }
        Returns: string
      }
      attendance_sheet: {
        Args: { p_date: string; p_stream: string }
        Returns: {
          excuse_reason: Database["public"]["Enums"]["excuse_reason"]
          full_name: string
          marked_at: string
          note: string
          photo_url: string
          rate: number
          status: Database["public"]["Enums"]["attendance_status"]
          student_id: string
          student_no: string
        }[]
      }
      attendance_summary: {
        Args: { p_from: string; p_to: string }
        Returns: {
          absent: number
          enrolled: number
          excused: number
          late: number
          present: number
          unmarked_today: number
        }[]
      }
      can_mark_stream: {
        Args: { p_date: string; p_stream: string }
        Returns: boolean
      }
      claim_tenant: { Args: { p_tenant: string }; Returns: string }
      clone_streams: {
        Args: { p_from_year: string; p_replace?: boolean; p_to_year: string }
        Returns: number
      }
      close_session: { Args: { p_session: string }; Returns: undefined }
      create_academic_year: {
        Args: {
          p_calendar_year: number
          p_ends_on?: string
          p_starts_on?: string
        }
        Returns: string
      }
      discard_promotion_run: {
        Args: { p_reason: string; p_run_id: string }
        Returns: undefined
      }
      enrol_student: { Args: { p_payload: Json }; Returns: string }
      ensure_streams: {
        Args: { p_labels?: string[]; p_tenant: string; p_year: string }
        Returns: number
      }
      ensure_streams_for_year: { Args: { p_year: string }; Returns: number }
      import_students: { Args: { p_batch: string }; Returns: Json }
      next_student_no: { Args: { p_tenant: string }; Returns: string }
      open_session: { Args: { p_session: string }; Returns: undefined }
      promotion_plan: {
        Args: { p_from_year: string; p_strategy?: string; p_to_year: string }
        Returns: Json
      }
      rollback_promotion: { Args: { p_run_id: string }; Returns: Json }
      run_promotion: {
        Args: { p_note?: string; p_run_id: string }
        Returns: Json
      }
      save_attendance: {
        Args: { p_date: string; p_entries: Json; p_stream: string }
        Returns: Json
      }
      save_staff: { Args: { p_payload: Json }; Returns: string }
      set_current_academic_year: {
        Args: { p_year: string }
        Returns: undefined
      }
      student_directory_stats: { Args: never; Returns: Json }
      term_admission_counts: {
        Args: never
        Returns: {
          admissions: number
          session_id: string
        }[]
      }
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
      attendance_status: "present" | "absent" | "late" | "excused"
      boarding_mode: "day" | "boarding" | "mixed"
      excuse_reason: "sick" | "permission" | "other"
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
      attendance_status: ["present", "absent", "late", "excused"],
      boarding_mode: ["day", "boarding", "mixed"],
      excuse_reason: ["sick", "permission", "other"],
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
