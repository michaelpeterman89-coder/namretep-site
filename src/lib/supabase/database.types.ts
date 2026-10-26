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
      admin_actions: {
        Row: {
          action: string
          admin_id: string | null
          created_at: string
          details: Json
          id: number
          table_id: string | null
          target_id: string | null
        }
        Insert: {
          action: string
          admin_id?: string | null
          created_at?: string
          details?: Json
          id?: never
          table_id?: string | null
          target_id?: string | null
        }
        Update: {
          action?: string
          admin_id?: string | null
          created_at?: string
          details?: Json
          id?: never
          table_id?: string | null
          target_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_actions_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_actions_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "game_tables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_actions_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      baccarat_games: {
        Row: {
          deal_at: string | null
          state: Json
          table_id: string
          updated_at: string
          version: number
        }
        Insert: {
          deal_at?: string | null
          state: Json
          table_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          deal_at?: string | null
          state?: Json
          table_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "baccarat_games_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: true
            referencedRelation: "game_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      baccarat_hands: {
        Row: {
          banker_cards: Json
          created_at: string
          id: number
          player_cards: Json
          table_id: string
          winner: string
        }
        Insert: {
          banker_cards: Json
          created_at?: string
          id?: never
          player_cards: Json
          table_id: string
          winner: string
        }
        Update: {
          banker_cards?: Json
          created_at?: string
          id?: never
          player_cards?: Json
          table_id?: string
          winner?: string
        }
        Relationships: [
          {
            foreignKeyName: "baccarat_hands_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "game_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      baccarat_shoes: {
        Row: {
          cards: Json
          table_id: string
        }
        Insert: {
          cards: Json
          table_id: string
        }
        Update: {
          cards?: Json
          table_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "baccarat_shoes_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: true
            referencedRelation: "game_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      blackjack_decisions: {
        Row: {
          action: string
          book_action: string
          created_at: string
          hints_enabled: boolean
          id: number
          on_book: boolean
          phase: string
          player_id: string
          round_id: string | null
          rules_key: string
          situation: string
          situation_key: string
          table_id: string | null
        }
        Insert: {
          action: string
          book_action: string
          created_at?: string
          hints_enabled?: boolean
          id?: never
          on_book: boolean
          phase: string
          player_id: string
          round_id?: string | null
          rules_key: string
          situation: string
          situation_key: string
          table_id?: string | null
        }
        Update: {
          action?: string
          book_action?: string
          created_at?: string
          hints_enabled?: boolean
          id?: never
          on_book?: boolean
          phase?: string
          player_id?: string
          round_id?: string | null
          rules_key?: string
          situation?: string
          situation_key?: string
          table_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blackjack_decisions_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blackjack_decisions_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "blackjack_rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blackjack_decisions_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "game_tables"
            referencedColumns: ["id"]
          },
        ]
      }
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
          deadline_at: string | null
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
          deadline_at?: string | null
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
          deadline_at?: string | null
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
      craps_games: {
        Row: {
          last_roll: Json | null
          roll_at: string | null
          shooter_id: string | null
          state: Json
          table_id: string
          updated_at: string
          version: number
        }
        Insert: {
          last_roll?: Json | null
          roll_at?: string | null
          shooter_id?: string | null
          state: Json
          table_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          last_roll?: Json | null
          roll_at?: string | null
          shooter_id?: string | null
          state?: Json
          table_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "craps_games_shooter_id_fkey"
            columns: ["shooter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "craps_games_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: true
            referencedRelation: "game_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      craps_rolls: {
        Row: {
          created_at: string
          die1: number
          die2: number
          event: string
          id: number
          shooter_id: string | null
          shooter_roll: number
          table_id: string
        }
        Insert: {
          created_at?: string
          die1: number
          die2: number
          event: string
          id?: never
          shooter_id?: string | null
          shooter_roll: number
          table_id: string
        }
        Update: {
          created_at?: string
          die1?: number
          die2?: number
          event?: string
          id?: never
          shooter_id?: string | null
          shooter_roll?: number
          table_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "craps_rolls_shooter_id_fkey"
            columns: ["shooter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "craps_rolls_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "game_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      game_tables: {
        Row: {
          betting_deadline_at: string | null
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
          betting_deadline_at?: string | null
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
          betting_deadline_at?: string | null
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
      player_game_stats: {
        Row: {
          biggest_loss: number
          biggest_win: number
          counters: Json
          game: string
          losses: number
          net_chips: number
          player_id: string
          pushes: number
          rounds: number
          rules_key: string
          updated_at: string
          wins: number
        }
        Insert: {
          biggest_loss?: number
          biggest_win?: number
          counters?: Json
          game: string
          losses?: number
          net_chips?: number
          player_id: string
          pushes?: number
          rounds?: number
          rules_key: string
          updated_at?: string
          wins?: number
        }
        Update: {
          biggest_loss?: number
          biggest_win?: number
          counters?: Json
          game?: string
          losses?: number
          net_chips?: number
          player_id?: string
          pushes?: number
          rounds?: number
          rules_key?: string
          updated_at?: string
          wins?: number
        }
        Relationships: [
          {
            foreignKeyName: "player_game_stats_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      poker_hand_secrets: {
        Row: {
          hand_id: string
          state: Json
        }
        Insert: {
          hand_id: string
          state: Json
        }
        Update: {
          hand_id?: string
          state?: Json
        }
        Relationships: [
          {
            foreignKeyName: "poker_hand_secrets_hand_id_fkey"
            columns: ["hand_id"]
            isOneToOne: true
            referencedRelation: "poker_hands"
            referencedColumns: ["id"]
          },
        ]
      }
      poker_hands: {
        Row: {
          completed_at: string | null
          created_at: string
          deadline_at: string | null
          hand_number: number
          id: string
          phase: string
          public_state: Json
          table_id: string
          version: number
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          deadline_at?: string | null
          hand_number: number
          id?: string
          phase: string
          public_state: Json
          table_id: string
          version?: number
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          deadline_at?: string | null
          hand_number?: number
          id?: string
          phase?: string
          public_state?: Json
          table_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "poker_hands_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "game_tables"
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
          is_admin: boolean
          last_refill_at: string | null
          suspended_at: string | null
          username: string
        }
        Insert: {
          avatar?: string
          chips?: number
          created_at?: string
          id: string
          is_admin?: boolean
          last_refill_at?: string | null
          suspended_at?: string | null
          username: string
        }
        Update: {
          avatar?: string
          chips?: number
          created_at?: string
          id?: string
          is_admin?: boolean
          last_refill_at?: string | null
          suspended_at?: string | null
          username?: string
        }
        Relationships: []
      }
      table_members: {
        Row: {
          joined_at: string
          player_id: string
          table_id: string
        }
        Insert: {
          joined_at?: string
          player_id: string
          table_id: string
        }
        Update: {
          joined_at?: string
          player_id?: string
          table_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "table_members_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_members_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "game_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      table_seats: {
        Row: {
          bet_placed_at: string | null
          bot_name: string | null
          joined_at: string
          leaving: boolean
          missed_turns: number
          pending_bet: number | null
          player_id: string | null
          seat_number: number
          stack: number | null
          status: string
          table_id: string
        }
        Insert: {
          bet_placed_at?: string | null
          bot_name?: string | null
          joined_at?: string
          leaving?: boolean
          missed_turns?: number
          pending_bet?: number | null
          player_id?: string | null
          seat_number: number
          stack?: number | null
          status?: string
          table_id: string
        }
        Update: {
          bet_placed_at?: string | null
          bot_name?: string | null
          joined_at?: string
          leaving?: boolean
          missed_turns?: number
          pending_bet?: number | null
          player_id?: string | null
          seat_number?: number
          stack?: number | null
          status?: string
          table_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "table_seats_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_seats_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "game_tables"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_adjust_chips: {
        Args: {
          p_admin: string
          p_amount: number
          p_note: string
          p_target: string
        }
        Returns: number
      }
      admin_log: {
        Args: {
          p_action: string
          p_admin: string
          p_details: Json
          p_table: string
          p_target: string
        }
        Returns: undefined
      }
      admin_overview: { Args: { p_admin: string }; Returns: Json }
      admin_rename: {
        Args: { p_admin: string; p_target: string; p_username: string }
        Returns: undefined
      }
      admin_set_admin: {
        Args: { p_admin: string; p_is_admin: boolean; p_target: string }
        Returns: undefined
      }
      admin_set_suspended: {
        Args: {
          p_admin: string
          p_note: string
          p_suspended: boolean
          p_target: string
        }
        Returns: undefined
      }
      apply_chip_changes: {
        Args: { p_changes: Json; p_round_id: string; p_table_id: string }
        Returns: undefined
      }
      assert_admin: { Args: { p_admin: string }; Returns: undefined }
      baccarat_save: {
        Args: {
          p_chips: Json
          p_deal_at: string
          p_hand: Json
          p_shoe: Json
          p_state: Json
          p_stats: Json
          p_table_id: string
          p_version: number
        }
        Returns: number
      }
      bj_act: {
        Args: {
          p_actor: string
          p_chips: Json
          p_deadline: string
          p_decisions: Json
          p_phase: string
          p_public: Json
          p_round_id: string
          p_secret: Json
          p_stats: Json
          p_timed_out: string[]
          p_version: number
        }
        Returns: number
      }
      bj_deal: {
        Args: {
          p_chips: Json
          p_deadline: string
          p_phase: string
          p_players: string[]
          p_public: Json
          p_secret: Json
          p_stats: Json
          p_table_id: string
        }
        Returns: {
          round_id: string
          round_number: number
        }[]
      }
      can_view_table: { Args: { p_table_id: string }; Returns: boolean }
      claim_daily_refill: { Args: never; Returns: number }
      close_idle_tables: { Args: never; Returns: number }
      craps_save: {
        Args: {
          p_chips: Json
          p_last_roll: Json
          p_roll: Json
          p_roll_at: string
          p_shooter: string
          p_state: Json
          p_stats: Json
          p_table_id: string
          p_version: number
        }
        Returns: number
      }
      jsonb_add_counters: { Args: { a: Json; b: Json }; Returns: Json }
      leaderboard: { Args: { p_period: string }; Returns: Json }
      leaderboard_since: { Args: { p_period: string }; Returns: string }
      my_book_summary: {
        Args: { p_rules_key?: string }
        Returns: {
          decisions: number
          hinted_decisions: number
          on_book: number
        }[]
      }
      my_missed_situations: {
        Args: { p_limit?: number; p_rules_key?: string }
        Returns: {
          book_action: string
          misses: number
          situation: string
          situation_key: string
          total: number
        }[]
      }
      poker_apply: {
        Args: {
          p_actor: string
          p_deadline: string
          p_hand_id: string
          p_phase: string
          p_public: Json
          p_secret: Json
          p_stacks: Json
          p_stats: Json
          p_timed_out: string[]
          p_version: number
        }
        Returns: number
      }
      poker_buy_in: {
        Args: {
          p_amount: number
          p_player_id: string
          p_seat_number: number
          p_table_id: string
        }
        Returns: undefined
      }
      poker_cash_out: {
        Args: { p_player_id: string; p_table_id: string }
        Returns: number
      }
      poker_start_hand: {
        Args: {
          p_deadline: string
          p_phase: string
          p_public: Json
          p_secret: Json
          p_table_id: string
        }
        Returns: {
          hand_id: string
          hand_number: number
        }[]
      }
      record_game_stats: { Args: { p_stats: Json }; Returns: undefined }
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
