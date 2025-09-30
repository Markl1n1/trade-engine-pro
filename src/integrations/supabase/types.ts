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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      market_data: {
        Row: {
          close: number
          close_time: number
          created_at: string
          high: number
          id: string
          low: number
          open: number
          open_time: number
          symbol: string
          timeframe: string
          volume: number
        }
        Insert: {
          close: number
          close_time: number
          created_at?: string
          high: number
          id?: string
          low: number
          open: number
          open_time: number
          symbol: string
          timeframe: string
          volume: number
        }
        Update: {
          close?: number
          close_time?: number
          created_at?: string
          high?: number
          id?: string
          low?: number
          open?: number
          open_time?: number
          symbol?: string
          timeframe?: string
          volume?: number
        }
        Relationships: []
      }
      strategies: {
        Row: {
          created_at: string
          description: string | null
          id: string
          initial_capital: number | null
          name: string
          position_size_percent: number | null
          status: Database["public"]["Enums"]["strategy_status"]
          stop_loss_percent: number | null
          symbol: string
          take_profit_percent: number | null
          timeframe: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          initial_capital?: number | null
          name: string
          position_size_percent?: number | null
          status?: Database["public"]["Enums"]["strategy_status"]
          stop_loss_percent?: number | null
          symbol?: string
          take_profit_percent?: number | null
          timeframe?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          initial_capital?: number | null
          name?: string
          position_size_percent?: number | null
          status?: Database["public"]["Enums"]["strategy_status"]
          stop_loss_percent?: number | null
          symbol?: string
          take_profit_percent?: number | null
          timeframe?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      strategy_backtest_results: {
        Row: {
          created_at: string
          end_date: string
          final_balance: number
          id: string
          initial_balance: number
          losing_trades: number
          max_drawdown: number
          sharpe_ratio: number | null
          start_date: string
          strategy_id: string
          total_return: number
          total_trades: number
          win_rate: number
          winning_trades: number
        }
        Insert: {
          created_at?: string
          end_date: string
          final_balance: number
          id?: string
          initial_balance: number
          losing_trades: number
          max_drawdown: number
          sharpe_ratio?: number | null
          start_date: string
          strategy_id: string
          total_return: number
          total_trades: number
          win_rate: number
          winning_trades: number
        }
        Update: {
          created_at?: string
          end_date?: string
          final_balance?: number
          id?: string
          initial_balance?: number
          losing_trades?: number
          max_drawdown?: number
          sharpe_ratio?: number | null
          start_date?: string
          strategy_id?: string
          total_return?: number
          total_trades?: number
          win_rate?: number
          winning_trades?: number
        }
        Relationships: [
          {
            foreignKeyName: "strategy_backtest_results_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
        ]
      }
      strategy_conditions: {
        Row: {
          created_at: string
          id: string
          indicator_type: Database["public"]["Enums"]["indicator_type"]
          indicator_type_2: Database["public"]["Enums"]["indicator_type"] | null
          logical_operator: string | null
          operator: Database["public"]["Enums"]["condition_operator"]
          order_index: number
          order_type: Database["public"]["Enums"]["order_type"]
          period_1: number | null
          period_2: number | null
          strategy_id: string
          value: number
          value2: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          indicator_type: Database["public"]["Enums"]["indicator_type"]
          indicator_type_2?:
            | Database["public"]["Enums"]["indicator_type"]
            | null
          logical_operator?: string | null
          operator: Database["public"]["Enums"]["condition_operator"]
          order_index?: number
          order_type: Database["public"]["Enums"]["order_type"]
          period_1?: number | null
          period_2?: number | null
          strategy_id: string
          value: number
          value2?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          indicator_type?: Database["public"]["Enums"]["indicator_type"]
          indicator_type_2?:
            | Database["public"]["Enums"]["indicator_type"]
            | null
          logical_operator?: string | null
          operator?: Database["public"]["Enums"]["condition_operator"]
          order_index?: number
          order_type?: Database["public"]["Enums"]["order_type"]
          period_1?: number | null
          period_2?: number | null
          strategy_id?: string
          value?: number
          value2?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "strategy_conditions_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_settings: {
        Row: {
          binance_api_key: string | null
          binance_api_secret: string | null
          created_at: string
          id: string
          telegram_bot_token: string | null
          telegram_chat_id: string | null
          telegram_enabled: boolean
          updated_at: string
          use_testnet: boolean
          user_id: string
        }
        Insert: {
          binance_api_key?: string | null
          binance_api_secret?: string | null
          created_at?: string
          id?: string
          telegram_bot_token?: string | null
          telegram_chat_id?: string | null
          telegram_enabled?: boolean
          updated_at?: string
          use_testnet?: boolean
          user_id: string
        }
        Update: {
          binance_api_key?: string | null
          binance_api_secret?: string | null
          created_at?: string
          id?: string
          telegram_bot_token?: string | null
          telegram_chat_id?: string | null
          telegram_enabled?: boolean
          updated_at?: string
          use_testnet?: boolean
          user_id?: string
        }
        Relationships: []
      }
      user_settings_audit: {
        Row: {
          accessed_at: string | null
          action: string
          id: string
          ip_address: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          accessed_at?: string | null
          action: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          accessed_at?: string | null
          action?: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_api_credentials: {
        Args: { user_uuid: string }
        Returns: {
          binance_api_key: string
          binance_api_secret: string
          use_testnet: boolean
        }[]
      }
    }
    Enums: {
      condition_operator:
        | "greater_than"
        | "less_than"
        | "equals"
        | "crosses_above"
        | "crosses_below"
        | "between"
        | "indicator_comparison"
      indicator_type:
        | "rsi"
        | "macd"
        | "sma"
        | "ema"
        | "bollinger_bands"
        | "stochastic"
        | "atr"
        | "adx"
      order_type: "buy" | "sell"
      strategy_status: "draft" | "active" | "paused" | "archived"
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
      condition_operator: [
        "greater_than",
        "less_than",
        "equals",
        "crosses_above",
        "crosses_below",
        "between",
        "indicator_comparison",
      ],
      indicator_type: [
        "rsi",
        "macd",
        "sma",
        "ema",
        "bollinger_bands",
        "stochastic",
        "atr",
        "adx",
      ],
      order_type: ["buy", "sell"],
      strategy_status: ["draft", "active", "paused", "archived"],
    },
  },
} as const
