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
      credential_access_log: {
        Row: {
          access_source: string | null
          accessed_at: string
          credential_type: string
          id: string
          success: boolean | null
          user_id: string
        }
        Insert: {
          access_source?: string | null
          accessed_at?: string
          credential_type: string
          id?: string
          success?: boolean | null
          user_id: string
        }
        Update: {
          access_source?: string | null
          accessed_at?: string
          credential_type?: string
          id?: string
          success?: boolean | null
          user_id?: string
        }
        Relationships: []
      }
      encrypted_credentials: {
        Row: {
          created_at: string
          credential_type: string
          encrypted_api_key: string | null
          encrypted_api_secret: string | null
          id: string
          key_nonce: string | null
          secret_nonce: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          credential_type: string
          encrypted_api_key?: string | null
          encrypted_api_secret?: string | null
          id?: string
          key_nonce?: string | null
          secret_nonce?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          credential_type?: string
          encrypted_api_key?: string | null
          encrypted_api_secret?: string | null
          id?: string
          key_nonce?: string | null
          secret_nonce?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      encryption_keys: {
        Row: {
          created_at: string
          id: string
          key_id: number
          purpose: string
        }
        Insert: {
          created_at?: string
          id?: string
          key_id: number
          purpose?: string
        }
        Update: {
          created_at?: string
          id?: string
          key_id?: number
          purpose?: string
        }
        Relationships: []
      }
      exchange_metrics: {
        Row: {
          created_at: string
          dr: number | null
          gcr: number | null
          id: string
          ifer: number | null
          symbol: string
          timestamp: string
          tmv: number | null
          ufr: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          dr?: number | null
          gcr?: number | null
          id?: string
          ifer?: number | null
          symbol: string
          timestamp?: string
          tmv?: number | null
          ufr?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          dr?: number | null
          gcr?: number | null
          id?: string
          ifer?: number | null
          symbol?: string
          timestamp?: string
          tmv?: number | null
          ufr?: number | null
          user_id?: string
        }
        Relationships: []
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
      position_events: {
        Row: {
          created_at: string | null
          entry_price: number | null
          event_type: string
          exit_price: number | null
          id: string
          pnl_amount: number | null
          pnl_percent: number | null
          position_size: number | null
          reason: string | null
          strategy_id: string
          symbol: string
          telegram_sent: boolean | null
          telegram_sent_at: string | null
          timestamp: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          entry_price?: number | null
          event_type: string
          exit_price?: number | null
          id?: string
          pnl_amount?: number | null
          pnl_percent?: number | null
          position_size?: number | null
          reason?: string | null
          strategy_id: string
          symbol: string
          telegram_sent?: boolean | null
          telegram_sent_at?: string | null
          timestamp?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          entry_price?: number | null
          event_type?: string
          exit_price?: number | null
          id?: string
          pnl_amount?: number | null
          pnl_percent?: number | null
          position_size?: number | null
          reason?: string | null
          strategy_id?: string
          symbol?: string
          telegram_sent?: boolean | null
          telegram_sent_at?: string | null
          timestamp?: string
          user_id?: string
        }
        Relationships: []
      }
      security_audit_log: {
        Row: {
          action: string
          created_at: string
          id: string
          ip_address: string | null
          record_id: string | null
          table_name: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          ip_address?: string | null
          record_id?: string | null
          table_name: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          record_id?: string | null
          table_name?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      signal_buffer: {
        Row: {
          buffered_at: string | null
          candle_timestamp: number
          created_at: string | null
          id: string
          price: number
          processed: boolean | null
          processed_at: string | null
          reason: string | null
          signal_type: string
          strategy_id: string
          symbol: string
          user_id: string
        }
        Insert: {
          buffered_at?: string | null
          candle_timestamp: number
          created_at?: string | null
          id?: string
          price: number
          processed?: boolean | null
          processed_at?: string | null
          reason?: string | null
          signal_type: string
          strategy_id: string
          symbol: string
          user_id: string
        }
        Update: {
          buffered_at?: string | null
          candle_timestamp?: number
          created_at?: string | null
          id?: string
          price?: number
          processed?: boolean | null
          processed_at?: string | null
          reason?: string | null
          signal_type?: string
          strategy_id?: string
          symbol?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "signal_buffer_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
        ]
      }
      strategies: {
        Row: {
          ath_guard_ath_safety_distance: number | null
          ath_guard_atr_sl_multiplier: number | null
          ath_guard_atr_tp1_multiplier: number | null
          ath_guard_atr_tp2_multiplier: number | null
          ath_guard_ema_slope_threshold: number | null
          ath_guard_pullback_tolerance: number | null
          ath_guard_rsi_threshold: number | null
          ath_guard_stoch_overbought: number | null
          ath_guard_stoch_oversold: number | null
          ath_guard_volume_multiplier: number | null
          atr_sl_multiplier: number | null
          atr_tp_multiplier: number | null
          benchmark_symbol: string | null
          created_at: string
          description: string | null
          id: string
          initial_capital: number | null
          mstg_exit_threshold: number | null
          mstg_extreme_threshold: number | null
          mstg_long_threshold: number | null
          mstg_short_threshold: number | null
          mstg_weight_momentum: number | null
          mstg_weight_relative: number | null
          mstg_weight_trend: number | null
          mstg_weight_volatility: number | null
          mtf_macd_fast: number | null
          mtf_macd_signal: number | null
          mtf_macd_slow: number | null
          mtf_rsi_entry_threshold: number | null
          mtf_rsi_period: number | null
          mtf_volume_multiplier: number | null
          name: string
          position_size_percent: number | null
          rsi_overbought: number | null
          rsi_oversold: number | null
          rsi_period: number | null
          sma_fast_period: number | null
          sma_slow_period: number | null
          status: Database["public"]["Enums"]["strategy_status"]
          stop_loss_percent: number | null
          strategy_type: string | null
          symbol: string
          take_profit_percent: number | null
          timeframe: string
          updated_at: string
          user_id: string
          volume_multiplier: number | null
        }
        Insert: {
          ath_guard_ath_safety_distance?: number | null
          ath_guard_atr_sl_multiplier?: number | null
          ath_guard_atr_tp1_multiplier?: number | null
          ath_guard_atr_tp2_multiplier?: number | null
          ath_guard_ema_slope_threshold?: number | null
          ath_guard_pullback_tolerance?: number | null
          ath_guard_rsi_threshold?: number | null
          ath_guard_stoch_overbought?: number | null
          ath_guard_stoch_oversold?: number | null
          ath_guard_volume_multiplier?: number | null
          atr_sl_multiplier?: number | null
          atr_tp_multiplier?: number | null
          benchmark_symbol?: string | null
          created_at?: string
          description?: string | null
          id?: string
          initial_capital?: number | null
          mstg_exit_threshold?: number | null
          mstg_extreme_threshold?: number | null
          mstg_long_threshold?: number | null
          mstg_short_threshold?: number | null
          mstg_weight_momentum?: number | null
          mstg_weight_relative?: number | null
          mstg_weight_trend?: number | null
          mstg_weight_volatility?: number | null
          mtf_macd_fast?: number | null
          mtf_macd_signal?: number | null
          mtf_macd_slow?: number | null
          mtf_rsi_entry_threshold?: number | null
          mtf_rsi_period?: number | null
          mtf_volume_multiplier?: number | null
          name: string
          position_size_percent?: number | null
          rsi_overbought?: number | null
          rsi_oversold?: number | null
          rsi_period?: number | null
          sma_fast_period?: number | null
          sma_slow_period?: number | null
          status?: Database["public"]["Enums"]["strategy_status"]
          stop_loss_percent?: number | null
          strategy_type?: string | null
          symbol?: string
          take_profit_percent?: number | null
          timeframe?: string
          updated_at?: string
          user_id: string
          volume_multiplier?: number | null
        }
        Update: {
          ath_guard_ath_safety_distance?: number | null
          ath_guard_atr_sl_multiplier?: number | null
          ath_guard_atr_tp1_multiplier?: number | null
          ath_guard_atr_tp2_multiplier?: number | null
          ath_guard_ema_slope_threshold?: number | null
          ath_guard_pullback_tolerance?: number | null
          ath_guard_rsi_threshold?: number | null
          ath_guard_stoch_overbought?: number | null
          ath_guard_stoch_oversold?: number | null
          ath_guard_volume_multiplier?: number | null
          atr_sl_multiplier?: number | null
          atr_tp_multiplier?: number | null
          benchmark_symbol?: string | null
          created_at?: string
          description?: string | null
          id?: string
          initial_capital?: number | null
          mstg_exit_threshold?: number | null
          mstg_extreme_threshold?: number | null
          mstg_long_threshold?: number | null
          mstg_short_threshold?: number | null
          mstg_weight_momentum?: number | null
          mstg_weight_relative?: number | null
          mstg_weight_trend?: number | null
          mstg_weight_volatility?: number | null
          mtf_macd_fast?: number | null
          mtf_macd_signal?: number | null
          mtf_macd_slow?: number | null
          mtf_rsi_entry_threshold?: number | null
          mtf_rsi_period?: number | null
          mtf_volume_multiplier?: number | null
          name?: string
          position_size_percent?: number | null
          rsi_overbought?: number | null
          rsi_oversold?: number | null
          rsi_period?: number | null
          sma_fast_period?: number | null
          sma_slow_period?: number | null
          status?: Database["public"]["Enums"]["strategy_status"]
          stop_loss_percent?: number | null
          strategy_type?: string | null
          symbol?: string
          take_profit_percent?: number | null
          timeframe?: string
          updated_at?: string
          user_id?: string
          volume_multiplier?: number | null
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
          last_cross_direction: string | null
          last_processed_candle_time: number | null
          last_signal_time: string | null
          position_open: boolean
          range_high: number | null
          range_low: number | null
          strategy_id: string
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          created_at?: string
          entry_price?: number | null
          entry_time?: string | null
          id?: string
          last_cross_direction?: string | null
          last_processed_candle_time?: number | null
          last_signal_time?: string | null
          position_open?: boolean
          range_high?: number | null
          range_low?: number | null
          strategy_id: string
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          created_at?: string
          entry_price?: number | null
          entry_time?: string | null
          id?: string
          last_cross_direction?: string | null
          last_processed_candle_time?: number | null
          last_signal_time?: string | null
          position_open?: boolean
          range_high?: number | null
          range_low?: number | null
          strategy_id?: string
          updated_at?: string
          user_id?: string
          version?: number
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
      strategy_signals: {
        Row: {
          candle_close_time: number | null
          created_at: string
          delivery_attempts: number | null
          error_message: string | null
          id: string
          last_attempt_at: string | null
          price: number
          reason: string | null
          signal_delivered_at: string | null
          signal_generated_at: string | null
          signal_hash: string | null
          signal_type: string
          status: string | null
          strategy_id: string
          symbol: string
          user_id: string
        }
        Insert: {
          candle_close_time?: number | null
          created_at?: string
          delivery_attempts?: number | null
          error_message?: string | null
          id?: string
          last_attempt_at?: string | null
          price: number
          reason?: string | null
          signal_delivered_at?: string | null
          signal_generated_at?: string | null
          signal_hash?: string | null
          signal_type: string
          status?: string | null
          strategy_id: string
          symbol: string
          user_id: string
        }
        Update: {
          candle_close_time?: number | null
          created_at?: string
          delivery_attempts?: number | null
          error_message?: string | null
          id?: string
          last_attempt_at?: string | null
          price?: number
          reason?: string | null
          signal_delivered_at?: string | null
          signal_generated_at?: string | null
          signal_hash?: string | null
          signal_type?: string
          status?: string | null
          strategy_id?: string
          symbol?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "strategy_signals_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
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
      system_health_logs: {
        Row: {
          created_at: string
          id: string
          message: string | null
          metrics: Json | null
          service_name: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          message?: string | null
          metrics?: Json | null
          service_name: string
          status: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string | null
          metrics?: Json | null
          service_name?: string
          status?: string
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          id: string
          setting_key: string
          setting_value: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          setting_key: string
          setting_value: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          setting_key?: string
          setting_value?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
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
          role?: Database["public"]["Enums"]["app_role"]
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
      user_settings: {
        Row: {
          binance_api_key: string | null
          binance_api_secret: string | null
          binance_mainnet_api_key: string | null
          binance_mainnet_api_secret: string | null
          binance_testnet_api_key: string | null
          binance_testnet_api_secret: string | null
          bybit_mainnet_api_key: string | null
          bybit_mainnet_api_secret: string | null
          bybit_testnet_api_key: string | null
          bybit_testnet_api_secret: string | null
          cache_indicators: boolean
          created_at: string
          credentials_migrated_at: string | null
          data_quality_score: number | null
          exchange_type: string | null
          handle_missing_data: string
          hybrid_stats: Json | null
          id: string
          last_data_sync: string | null
          max_daily_trades: number
          max_data_age_minutes: number
          max_position_size: number
          paper_trading_mode: boolean
          real_data_simulation: boolean
          risk_tolerance: string
          risk_warning_threshold: number
          sync_mainnet_data: boolean
          telegram_bot_token: string | null
          telegram_chat_id: string | null
          telegram_enabled: boolean
          trading_mode: string
          updated_at: string
          use_mainnet_data: boolean
          use_testnet: boolean
          use_testnet_api: boolean
          user_id: string
          validate_data_integrity: boolean
        }
        Insert: {
          binance_api_key?: string | null
          binance_api_secret?: string | null
          binance_mainnet_api_key?: string | null
          binance_mainnet_api_secret?: string | null
          binance_testnet_api_key?: string | null
          binance_testnet_api_secret?: string | null
          bybit_mainnet_api_key?: string | null
          bybit_mainnet_api_secret?: string | null
          bybit_testnet_api_key?: string | null
          bybit_testnet_api_secret?: string | null
          cache_indicators?: boolean
          created_at?: string
          credentials_migrated_at?: string | null
          data_quality_score?: number | null
          exchange_type?: string | null
          handle_missing_data?: string
          hybrid_stats?: Json | null
          id?: string
          last_data_sync?: string | null
          max_daily_trades?: number
          max_data_age_minutes?: number
          max_position_size?: number
          paper_trading_mode?: boolean
          real_data_simulation?: boolean
          risk_tolerance?: string
          risk_warning_threshold?: number
          sync_mainnet_data?: boolean
          telegram_bot_token?: string | null
          telegram_chat_id?: string | null
          telegram_enabled?: boolean
          trading_mode?: string
          updated_at?: string
          use_mainnet_data?: boolean
          use_testnet?: boolean
          use_testnet_api?: boolean
          user_id: string
          validate_data_integrity?: boolean
        }
        Update: {
          binance_api_key?: string | null
          binance_api_secret?: string | null
          binance_mainnet_api_key?: string | null
          binance_mainnet_api_secret?: string | null
          binance_testnet_api_key?: string | null
          binance_testnet_api_secret?: string | null
          bybit_mainnet_api_key?: string | null
          bybit_mainnet_api_secret?: string | null
          bybit_testnet_api_key?: string | null
          bybit_testnet_api_secret?: string | null
          cache_indicators?: boolean
          created_at?: string
          credentials_migrated_at?: string | null
          data_quality_score?: number | null
          exchange_type?: string | null
          handle_missing_data?: string
          hybrid_stats?: Json | null
          id?: string
          last_data_sync?: string | null
          max_daily_trades?: number
          max_data_age_minutes?: number
          max_position_size?: number
          paper_trading_mode?: boolean
          real_data_simulation?: boolean
          risk_tolerance?: string
          risk_warning_threshold?: number
          sync_mainnet_data?: boolean
          telegram_bot_token?: string | null
          telegram_chat_id?: string | null
          telegram_enabled?: boolean
          trading_mode?: string
          updated_at?: string
          use_mainnet_data?: boolean
          use_testnet?: boolean
          use_testnet_api?: boolean
          user_id?: string
          validate_data_integrity?: boolean
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
      cleanup_old_buffered_signals: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      cleanup_old_health_logs: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      decrypt_credential: {
        Args: {
          p_access_source?: string
          p_credential_type: string
          p_user_id: string
        }
        Returns: {
          api_key: string
          api_secret: string
        }[]
      }
      encrypt_credential: {
        Args: {
          p_api_key: string
          p_api_secret: string
          p_credential_type: string
          p_user_id: string
        }
        Returns: string
      }
      get_user_api_credentials: {
        Args: { user_uuid: string }
        Returns: {
          binance_api_key: string
          binance_api_secret: string
          use_testnet: boolean
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      immutable_date_trunc_minute: {
        Args: { "": string }
        Returns: string
      }
      migrate_all_credentials: {
        Args: Record<PropertyKey, never>
        Returns: {
          error_message: string
          success: boolean
          user_id: string
        }[]
      }
      migrate_user_credentials_to_encrypted: {
        Args: { p_user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
        | "supertrend"
        | "td_sequential"
        | "anchored_vwap"
        | "bb_width"
        | "percent_b"
        | "ema_crossover"
        | "kdj_j"
        | "psar"
        | "cmf"
        | "ichimoku_tenkan"
        | "ichimoku_kijun"
        | "ichimoku_senkou_a"
        | "ichimoku_senkou_b"
        | "ichimoku_chikou"
        | "price"
        | "open"
        | "high"
        | "low"
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
      app_role: ["admin", "user"],
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
        "supertrend",
        "td_sequential",
        "anchored_vwap",
        "bb_width",
        "percent_b",
        "ema_crossover",
        "kdj_j",
        "psar",
        "cmf",
        "ichimoku_tenkan",
        "ichimoku_kijun",
        "ichimoku_senkou_a",
        "ichimoku_senkou_b",
        "ichimoku_chikou",
        "price",
        "open",
        "high",
        "low",
      ],
      order_type: ["buy", "sell"],
      strategy_status: ["draft", "active", "paused", "archived"],
    },
  },
} as const
