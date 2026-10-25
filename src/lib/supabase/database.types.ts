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
      blackjack_round_secrets: {
        Row: {
          round_id: string
          state: Json
        }
        Insert: {
          round_id: string
          state: Json
        }
        Update: {
          round_id?: string
          state?: Json
        }
        Relationships: [
          {
            foreignKeyName: "blackjack_round_secrets_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: true
            referencedRelation: "blackjack_rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      blackjack_rounds: {
        Row: {
          created_at: string
          id: string
          phase: string
          public_state: Json
          round_number: number
          settled_at: string | null
          table_id: string
          version: number
        }
        Insert: {
          created_at?: string
          id?: string
          phase: string
          public_state: Json
          round_number: number
          settled_at?: string | null
          table_id: string
          version?: number
        }
        Update: {
          created_at?: string
          id?: string
          phase?: string
          public_state?: Json
          round_number?: number
          settled_at?: string | null
          table_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "blackjack_rounds_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "game_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      chip_ledger: {
        Row: {
          amount: number
          balance_after: number
          created_at: string
          id: number
          player_id: string
          reason: string
          round_id: string | null
          table_id: string | null
        }
        Insert: {
          amount: number
          balance_after: number
          created_at?: string
          id?: never
          player_id: string
          reason: string
          round_id?: string | null
          table_id?: string | null
        }
        Update: {
          amount?: number
          balance_after?: number
          created_at?: string
          id?: never
          player_id?: string
          reason?: string
          round_id?: string | null
          table_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chip_ledger_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chip_ledger_round_fk"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "blackjack_rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chip_ledger_table_fk"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "game_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      game_tables: {
        Row: {
          closed_at: string | null
          created_at: string
          game: string
          id: string
          invite_code: string | null
          last_activity_at: string
          max_bet: number
          min_bet: number
          name: string
          owner_id: string
          rules: Json
          seats: number
          status: string
          visibility: string
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          game: string
          id?: string
          invite_code?: string | null
          last_activity_at?: string
          max_bet: number
          min_bet: number
          name: string
          owner_id: string
          rules: Json
          seats: number
          status?: string
          visibility: string
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          game?: string
          id?: string
          invite_code?: string | null
          last_activity_at?: string
          max_bet?: number
          min_bet?: number
          name?: string
          owner_id?: string
          rules?: Json
          seats?: number
          status?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_tables_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar: string
          chips: number
          created_at: string
          id: string
          last_refill_at: string | null
          username: string
        }
        Insert: {
          avatar?: string
          chips?: number
          created_at?: string
          id: string
          last_refill_at?: string | null
          username: string
        }
        Update: {
          avatar?: string
          chips?: number
          created_at?: string
          id?: string
          last_refill_at?: string | null
          username?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_chip_changes: {
        Args: { p_changes: Json; p_round_id: string; p_table_id: string }
        Returns: undefined
      }
      bj_start_round: {
        Args: {
          p_chips: Json
          p_phase: string
          p_public: Json
          p_secret: Json
          p_table_id: string
        }
        Returns: {
          round_id: string
          round_number: number
        }[]
      }
      bj_update_round: {
        Args: {
          p_chips: Json
          p_phase: string
          p_public: Json
          p_round_id: string
          p_secret: Json
          p_version: number
        }
        Returns: number
      }
      claim_daily_refill: { Args: never; Returns: number }
      username_available: { Args: { name: string }; Returns: boolean }
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
    Enums: {},
  },
} as const
