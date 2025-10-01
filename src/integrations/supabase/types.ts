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
      condition_groups: {
        Row: {
          created_at: string | null
          group_name: string
          group_operator: string | null
          id: string
          order_index: number
          strategy_id: string | null
        }
        Insert: {
          created_at?: string | null
          group_name: string
          group_operator?: string | null
          id?: string
          order_index?: number
          strategy_id?: string | null
        }
        Update: {
          created_at?: string | null
          group_name?: string
          group_operator?: string | null
          id?: string
          order_index?: number
          strategy_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "condition_groups_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
        ]
      }
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
          strategy_type: string | null
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
          strategy_type?: string | null
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
          strategy_type?: string | null
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
          acceleration: number | null
          confirmation_bars: number | null
          created_at: string
          deviation: number | null
          group_id: string | null
          id: string
          indicator_type: Database["public"]["Enums"]["indicator_type"]
          indicator_type_2: Database["public"]["Enums"]["indicator_type"] | null
          logical_operator: string | null
          lookback_bars: number | null
          multiplier: number | null
          operator: Database["public"]["Enums"]["condition_operator"]
          order_index: number
          order_type: Database["public"]["Enums"]["order_type"]
          period_1: number | null
          period_2: number | null
          smoothing: number | null
          strategy_id: string
          value: number
          value2: number | null
        }
        Insert: {
          acceleration?: number | null
          confirmation_bars?: number | null
          created_at?: string
          deviation?: number | null
          group_id?: string | null
          id?: string
          indicator_type: Database["public"]["Enums"]["indicator_type"]
          indicator_type_2?:
            | Database["public"]["Enums"]["indicator_type"]
            | null
          logical_operator?: string | null
          lookback_bars?: number | null
          multiplier?: number | null
          operator: Database["public"]["Enums"]["condition_operator"]
          order_index?: number
          order_type: Database["public"]["Enums"]["order_type"]
          period_1?: number | null
          period_2?: number | null
          smoothing?: number | null
          strategy_id: string
          value: number
          value2?: number | null
        }
        Update: {
          acceleration?: number | null
          confirmation_bars?: number | null
          created_at?: string
          deviation?: number | null
          group_id?: string | null
          id?: string
          indicator_type?: Database["public"]["Enums"]["indicator_type"]
          indicator_type_2?:
            | Database["public"]["Enums"]["indicator_type"]
            | null
          logical_operator?: string | null
          lookback_bars?: number | null
          multiplier?: number | null
          operator?: Database["public"]["Enums"]["condition_operator"]
          order_index?: number
          order_type?: Database["public"]["Enums"]["order_type"]
          period_1?: number | null
          period_2?: number | null
          smoothing?: number | null
          strategy_id?: string
          value?: number
          value2?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "strategy_conditions_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "condition_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "strategy_conditions_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
        ]
      }
      strategy_live_states: {
        Row: {
          created_at: string
          entry_price: number | null
          entry_time: string | null
          id: string
          last_signal_time: string | null
          position_open: boolean
          range_high: number | null
          range_low: number | null
          strategy_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          entry_price?: number | null
          entry_time?: string | null
          id?: string
          last_signal_time?: string | null
          position_open?: boolean
          range_high?: number | null
          range_low?: number | null
          strategy_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          entry_price?: number | null
          entry_time?: string | null
          id?: string
          last_signal_time?: string | null
          position_open?: boolean
          range_high?: number | null
          range_low?: number | null
          strategy_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "strategy_live_states_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: true
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
        ]
      }
      strategy_templates: {
        Row: {
          category: string
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          initial_capital: number | null
          is_public: boolean | null
          name: string
          position_size_percent: number | null
          stop_loss_percent: number | null
          strategy_type: string | null
          symbol: string | null
          take_profit_percent: number | null
          template_data: Json
          timeframe: string | null
          usage_count: number | null
        }
        Insert: {
          category: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          initial_capital?: number | null
          is_public?: boolean | null
          name: string
          position_size_percent?: number | null
          stop_loss_percent?: number | null
          strategy_type?: string | null
          symbol?: string | null
          take_profit_percent?: number | null
          template_data: Json
          timeframe?: string | null
          usage_count?: number | null
        }
        Update: {
          category?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          initial_capital?: number | null
          is_public?: boolean | null
          name?: string
          position_size_percent?: number | null
          stop_loss_percent?: number | null
          strategy_type?: string | null
          symbol?: string | null
          take_profit_percent?: number | null
          template_data?: Json
          timeframe?: string | null
          usage_count?: number | null
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          binance_api_key: string | null
          binance_api_secret: string | null
          binance_mainnet_api_key: string | null
          binance_mainnet_api_secret: string | null
          binance_testnet_api_key: string | null
          binance_testnet_api_secret: string | null
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
          binance_mainnet_api_key?: string | null
          binance_mainnet_api_secret?: string | null
          binance_testnet_api_key?: string | null
          binance_testnet_api_secret?: string | null
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
          binance_mainnet_api_key?: string | null
          binance_mainnet_api_secret?: string | null
          binance_testnet_api_key?: string | null
          binance_testnet_api_secret?: string | null
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
      user_trading_pairs: {
        Row: {
          base_asset: string
          created_at: string | null
          id: string
          quote_asset: string
          symbol: string
          user_id: string
        }
        Insert: {
          base_asset: string
          created_at?: string | null
          id?: string
          quote_asset: string
          symbol: string
          user_id: string
        }
        Update: {
          base_asset?: string
          created_at?: string | null
          id?: string
          quote_asset?: string
          symbol?: string
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
        | "CROSSES_ABOVE"
        | "CROSSES_BELOW"
        | "BULLISH_DIVERGENCE"
        | "BEARISH_DIVERGENCE"
        | "BREAKOUT_ABOVE"
        | "BREAKOUT_BELOW"
        | "BOUNCE_OFF"
        | "IN_RANGE"
      indicator_type:
        | "rsi"
        | "macd"
        | "sma"
        | "ema"
        | "bollinger_bands"
        | "stochastic"
        | "atr"
        | "adx"
        | "WMA"
        | "KAMA"
        | "MAMA"
        | "DEMA"
        | "TEMA"
        | "WILDER_MA"
        | "VWMA"
        | "HULL_MA"
        | "STOCHASTIC"
        | "MOMENTUM"
        | "CCI"
        | "CHAIKIN_OSC"
        | "AROON"
        | "WPR"
        | "MFI"
        | "CMF"
        | "CRSI"
        | "TMF"
        | "TRIX"
        | "TSI"
        | "ULTIMATE_OSC"
        | "ROC"
        | "BOP"
        | "AWESOME_OSC"
        | "ACCELERATOR_OSC"
        | "STOCH_RSI"
        | "STC"
        | "RMI"
        | "RCI"
        | "SMA_RSI"
        | "EMA_RSI"
        | "SMI"
        | "SMIE"
        | "CHMO"
        | "KDJ"
        | "VOLATILITY_STOP"
        | "TII"
        | "MCGINLEY"
        | "DEMAND_INDEX"
        | "BB_UPPER"
        | "BB_LOWER"
        | "BB_MIDDLE"
        | "ADX"
        | "PLUS_DI"
        | "MINUS_DI"
        | "OBV"
        | "AD_LINE"
        | "PSAR"
        | "FIBONACCI"
        | "VWAP"
        | "ICHIMOKU_TENKAN"
        | "ICHIMOKU_KIJUN"
        | "ICHIMOKU_SENKOU_A"
        | "ICHIMOKU_SENKOU_B"
        | "KELTNER_UPPER"
        | "KELTNER_LOWER"
        | "VOLUME"
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
        "CROSSES_ABOVE",
        "CROSSES_BELOW",
        "BULLISH_DIVERGENCE",
        "BEARISH_DIVERGENCE",
        "BREAKOUT_ABOVE",
        "BREAKOUT_BELOW",
        "BOUNCE_OFF",
        "IN_RANGE",
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
        "WMA",
        "KAMA",
        "MAMA",
        "DEMA",
        "TEMA",
        "WILDER_MA",
        "VWMA",
        "HULL_MA",
        "STOCHASTIC",
        "MOMENTUM",
        "CCI",
        "CHAIKIN_OSC",
        "AROON",
        "WPR",
        "MFI",
        "CMF",
        "CRSI",
        "TMF",
        "TRIX",
        "TSI",
        "ULTIMATE_OSC",
        "ROC",
        "BOP",
        "AWESOME_OSC",
        "ACCELERATOR_OSC",
        "STOCH_RSI",
        "STC",
        "RMI",
        "RCI",
        "SMA_RSI",
        "EMA_RSI",
        "SMI",
        "SMIE",
        "CHMO",
        "KDJ",
        "VOLATILITY_STOP",
        "TII",
        "MCGINLEY",
        "DEMAND_INDEX",
        "BB_UPPER",
        "BB_LOWER",
        "BB_MIDDLE",
        "ADX",
        "PLUS_DI",
        "MINUS_DI",
        "OBV",
        "AD_LINE",
        "PSAR",
        "FIBONACCI",
        "VWAP",
        "ICHIMOKU_TENKAN",
        "ICHIMOKU_KIJUN",
        "ICHIMOKU_SENKOU_A",
        "ICHIMOKU_SENKOU_B",
        "KELTNER_UPPER",
        "KELTNER_LOWER",
        "VOLUME",
      ],
      order_type: ["buy", "sell"],
      strategy_status: ["draft", "active", "paused", "archived"],
    },
  },
} as const
