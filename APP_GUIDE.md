# 🚀 Advanced Crypto Trading Platform - Architecture Guide

**Version:** 2.0  
**Last Updated:** January 2025  
**Platform:** Lovable Cloud

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture Overview](#architecture-overview)
3. [Authentication System](#authentication-system)
4. [Database Schema](#database-schema)
5. [Edge Functions](#edge-functions)
6. [Monitoring Systems](#monitoring-systems)
7. [Strategy Types](#strategy-types)
8. [Exchange Integration](#exchange-integration)
9. [Deployment & Hosting](#deployment--hosting)
10. [Development Workflow](#development-workflow)
11. [Security Considerations](#security-considerations)
12. [Troubleshooting Guide](#troubleshooting-guide)
13. [Performance Optimization](#performance-optimization)
14. [Future Enhancements](#future-enhancements)
15. [Support & Resources](#support--resources)

---

## Project Overview

### Application Name
**Advanced Crypto Trading Platform**

### Purpose
A sophisticated cryptocurrency trading platform with advanced features:
- **Advanced Strategy Management** - Visual and JavaScript-based strategy creation
- **Enhanced Backtesting** - Look-ahead bias prevention and accurate calculations
- **Risk Management** - Portfolio risk monitoring and adaptive stop losses
- **Performance Monitoring** - Real-time system performance tracking
- **Data Quality Control** - Automated data validation and cleaning
- **Hybrid Trading Mode** - Testnet API with mainnet data for safe testing
- **Custom Strategies** - JavaScript code execution for complex strategies
- **Strategy Validation** - Automated testing and validation
- **Real-time Monitoring** - Live strategy execution and signal generation

### Technology Stack Summary

**Frontend:**
- React 18.3.1 with TypeScript
- Vite build system
- React Router v6 for navigation
- TanStack Query for server state management
- shadcn/ui component library
- Tailwind CSS for styling
- Lucide React for icons

**Backend:**
- Lovable Cloud (Supabase-powered infrastructure)
- PostgreSQL database with Row-Level Security
- Deno Edge Functions for serverless logic
- pg_cron for scheduled tasks
- pg_net for HTTP requests from database
- Real-time subscriptions

**External Integrations:**
- Binance Futures API (mainnet + testnet)
- Bybit Perpetual API (mainnet + testnet)
- Telegram Bot API for notifications

### Key Capabilities

1. **Strategy Management**
   - Visual strategy builder with 15+ technical indicators
   - Pre-built strategy templates
   - Custom strategy types (MSTG, ATH Guard, 4h Reentry)
   - Strategy cloning and sharing

2. **Backtesting**
   - Historical performance analysis
   - Key metrics: Win rate, Sharpe ratio, max drawdown
   - Trade log visualization
   - PDF report generation

3. **Live Monitoring**
   - Two-tier monitoring (frontend + backend)
   - Real-time signal generation
   - Position synchronization with exchanges
   - Live status indicators

4. **Signal Delivery**
   - Telegram notifications
   - Signal buffering and retry logic
   - Delivery tracking and logging
   - Error handling with exponential backoff

5. **Multi-Exchange Support**
   - Binance Futures (mainnet + testnet)
   - Bybit Perpetual (mainnet + testnet)
   - Unified exchange abstraction layer
   - Automatic API endpoint selection

---

## Architecture Overview

### Frontend Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    React Frontend                        │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐ │
│  │   Pages     │  │  Components  │  │     Hooks      │ │
│  │ - Dashboard │  │ - Strategy   │  │ - useAuth      │ │
│  │ - Strategies│  │   Builder    │  │ - useLive      │ │
│  │ - Backtest  │  │ - Monitoring │  │   Monitoring   │ │
│  │ - Settings  │  │ - Charts     │  │ - useStrategies│ │
│  └─────────────┘  └──────────────┘  └────────────────┘ │
│                                                          │
│  ┌─────────────────────────────────────────────────┐   │
│  │         TanStack Query (Data Layer)              │   │
│  │  - Caching, refetching, optimistic updates      │   │
│  └─────────────────────────────────────────────────┘   │
│                           ↕                             │
│  ┌─────────────────────────────────────────────────┐   │
│  │       Supabase Client (Auto-generated)          │   │
│  │  - Auth, Database, Real-time, Functions         │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────┐
│              Lovable Cloud Backend                       │
└─────────────────────────────────────────────────────────┘
```

**Key Frontend Components:**

- **Pages:** Route-level components
  - `Dashboard.tsx` - Overview and quick stats
  - `Strategies.tsx` - Strategy management
  - `Backtest.tsx` - Backtesting interface
  - `Settings.tsx` - User configuration
  - `Auth.tsx` - Authentication flow

- **Core Components:**
  - `StrategyBuilder.tsx` - Visual condition builder
  - `StrategyDebugPanel.tsx` - Real-time debugging
  - `MonitoringStatus.tsx` - Live monitoring UI
  - `BacktestTradeLog.tsx` - Trade history visualization
  - `TradingPairsManager.tsx` - Trading pair selection

- **Custom Hooks:**
  - `useAuth.tsx` - Authentication state management
  - `useLiveMonitoring.tsx` - Real-time monitoring state

### Backend Architecture

```
┌───────────────────────────────────────────────────────────────┐
│                    Lovable Cloud (Supabase)                    │
│                                                                │
│  ┌──────────────────────────────────────────────────────┐    │
│  │              PostgreSQL Database                     │    │
│  │  - 18 Tables with RLS policies                       │    │
│  │  - Custom functions & triggers                       │    │
│  │  - Audit logging                                     │    │
│  └──────────────────────────────────────────────────────┘    │
│                           ↕                                   │
│  ┌──────────────────────────────────────────────────────┐    │
│  │           Edge Functions (Deno Runtime)              │    │
│  │  - Monitoring (cron + realtime)                      │    │
│  │  - Market data fetching                              │    │
│  │  - Signal processing                                 │    │
│  │  - Trading operations                                │    │
│  └──────────────────────────────────────────────────────┘    │
│                           ↕                                   │
│  ┌──────────────────────────────────────────────────────┐    │
│  │              pg_cron Scheduler                       │    │
│  │  - monitor-strategies-cron (1 min)                   │    │
│  │  - process-buffered-signals (5 min)                  │    │
│  │  - check-binance-positions (1 min)                   │    │
│  │  - retry-failed-signals (10 min)                     │    │
│  │  - cleanup jobs (daily)                              │    │
│  └──────────────────────────────────────────────────────┘    │
└───────────────────────────────────────────────────────────────┘
                            ↕
┌───────────────────────────────────────────────────────────────┐
│                   External Services                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │   Binance    │  │    Bybit     │  │   Telegram   │       │
│  │  Futures API │  │ Perpetual API│  │    Bot API   │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
└───────────────────────────────────────────────────────────────┘
```

**Backend Services:**

1. **Database Layer (PostgreSQL)**
   - Row-Level Security for multi-tenant isolation
   - Security definer functions for privileged operations
   - Audit logging for sensitive operations
   - Optimistic locking for concurrent updates

2. **Edge Functions (Deno)**
   - Serverless execution environment
   - TypeScript support
   - No cold starts for active functions
   - Automatic scaling

3. **Scheduled Jobs (pg_cron)**
   - Backend monitoring (1-minute intervals)
   - Signal processing and retry logic
   - Position synchronization
   - Data cleanup and maintenance

---

## Authentication System

### Method: Supabase Auth

The application uses Supabase's built-in authentication system with email/password login.

### Authentication Flow

```
┌──────────┐      ┌──────────────┐      ┌─────────────┐
│  User    │─────▶│  Auth Page   │─────▶│  Supabase   │
│ (Browser)│      │ /auth route  │      │    Auth     │
└──────────┘      └──────────────┘      └─────────────┘
                         │                      │
                         │ 1. Email/Password    │
                         ├─────────────────────▶│
                         │                      │
                         │ 2. JWT Token         │
                         │◀─────────────────────┤
                         │                      │
                         │ 3. Store in          │
                         │    localStorage      │
                         │                      │
┌──────────┐             │                      │
│Protected │◀────────────┤                      │
│  Routes  │ 4. Navigate │                      │
└──────────┘      with token                    │
                         │                      │
                         │ 5. All API calls     │
                         │    include token     │
                         ├─────────────────────▶│
                         │    in Authorization  │
                         │    header            │
```

### Key Components

**Frontend:**
- `src/pages/Auth.tsx` - Authentication UI
- `src/components/ProtectedRoute.tsx` - Route protection wrapper
- `src/hooks/useAuth.tsx` - Authentication state management

**Backend:**
- JWT token validation on all protected endpoints
- Row-Level Security policies using `auth.uid()`
- Session management with auto-refresh

### Security Features

1. **Role-Based Access Control (RBAC)**
   ```sql
   -- Separate user_roles table
   CREATE TABLE user_roles (
     user_id UUID REFERENCES auth.users(id),
     role app_role NOT NULL -- 'admin', 'moderator', 'user'
   );
   
   -- Security definer function to prevent RLS recursion
   CREATE FUNCTION has_role(_user_id UUID, _role app_role)
   RETURNS BOOLEAN
   SECURITY DEFINER
   AS $$
     SELECT EXISTS (
       SELECT 1 FROM user_roles
       WHERE user_id = _user_id AND role = _role
     );
   $$;
   ```

2. **Session Management**
   - JWT tokens stored in localStorage
   - Auto-refresh before expiration
   - Session listeners for real-time auth state
   - Graceful handling of expired sessions

3. **Input Validation**
   - Zod schemas for all user inputs
   - Type checking with TypeScript
   - SQL injection prevention via parameterized queries

4. **Audit Logging**
   - `user_settings_audit` table tracks sensitive operations
   - `security_audit_log` for system-level events
   - IP address and user agent logging

### Auto-Confirm Email Signups

⚠️ **Important:** Auto-confirm is enabled for development. For production, configure proper email verification:

```sql
-- Check current auth settings
SELECT * FROM auth.config;

-- Enable email confirmation (production)
UPDATE auth.config 
SET enable_signup = true, 
    email_confirm = true;
```

---

## Database Schema

### Core Tables Overview

The database consists of 18 tables organized into logical groups:

#### User Management
- `user_roles` - Role-based access control
- `user_settings` - User preferences and API keys
- `user_settings_audit` - Audit trail for settings
- `user_trading_pairs` - Selected trading pairs

#### Strategy Management
- `strategies` - Strategy definitions
- `strategy_conditions` - Technical indicator conditions
- `condition_groups` - Grouped conditions with AND/OR logic
- `strategy_live_states` - Real-time execution state
- `strategy_templates` - Pre-built templates

#### Trading & Signals
- `strategy_signals` - Generated trading signals
- `signal_buffer` - Buffer for signal processing
- `position_events` - Position open/close tracking
- `strategy_backtest_results` - Backtesting results

#### Market Data
- `market_data` - Historical OHLCV candles
- `exchange_metrics` - Exchange-specific metrics

#### System
- `system_settings` - Global configuration
- `system_health_logs` - System monitoring
- `security_audit_log` - Security events

### Entity Relationships

```
users (auth.users)
  │
  ├──▶ user_roles (1:many)
  ├──▶ user_settings (1:1)
  ├──▶ user_trading_pairs (1:many)
  │
  └──▶ strategies (1:many)
        │
        ├──▶ strategy_conditions (1:many)
        │     └──▶ condition_groups (many:1)
        │
        ├──▶ strategy_live_states (1:1)
        ├──▶ strategy_signals (1:many)
        ├──▶ strategy_backtest_results (1:many)
        └──▶ position_events (1:many)
```

### Key Tables Detail

#### strategies
```sql
CREATE TABLE strategies (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  status strategy_status, -- 'draft', 'active', 'paused'
  strategy_type TEXT, -- 'standard', '4h_reentry', 'mstg', 'ath_guard_scalping'
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  
  -- Risk management
  position_size_percent NUMERIC,
  stop_loss_percent NUMERIC,
  take_profit_percent NUMERIC,
  
  -- Strategy-specific parameters
  -- (MSTG, ATH Guard config columns)
);
```

#### strategy_conditions
```sql
CREATE TABLE strategy_conditions (
  id UUID PRIMARY KEY,
  strategy_id UUID NOT NULL,
  order_type order_type, -- 'buy' or 'sell'
  indicator_type indicator_type, -- 'rsi', 'ema', 'sma', etc.
  operator condition_operator, -- 'greater_than', 'crosses_above', etc.
  value NUMERIC,
  
  -- Indicator parameters
  period_1 INTEGER,
  period_2 INTEGER,
  -- ... more parameters
);
```

#### strategy_live_states
```sql
CREATE TABLE strategy_live_states (
  id UUID PRIMARY KEY,
  strategy_id UUID NOT NULL UNIQUE,
  user_id UUID NOT NULL,
  position_open BOOLEAN DEFAULT false,
  entry_price NUMERIC,
  entry_time TIMESTAMPTZ,
  last_processed_candle_time BIGINT,
  
  version INTEGER DEFAULT 1, -- Optimistic locking
  updated_at TIMESTAMPTZ
);
```

### Sensitive Data Storage

API keys and secrets are stored encrypted in the `user_settings` table:

```sql
CREATE TABLE user_settings (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  
  -- Exchange API credentials
  binance_mainnet_api_key TEXT,
  binance_mainnet_api_secret TEXT,
  binance_testnet_api_key TEXT,
  binance_testnet_api_secret TEXT,
  bybit_mainnet_api_key TEXT,
  bybit_mainnet_api_secret TEXT,
  bybit_testnet_api_key TEXT,
  bybit_testnet_api_secret TEXT,
  
  -- Telegram credentials
  telegram_bot_token TEXT,
  telegram_chat_id TEXT
);
```

**Security Measures:**
1. RLS policies ensure users can only access their own settings
2. Security definer functions for privileged credential access
3. All credential access is logged to `user_settings_audit`
4. Credentials are never exposed to frontend

---

## Edge Functions

Edge functions are serverless TypeScript/Deno functions that run on Lovable Cloud.

### Function Categories

#### 1. Monitoring Functions

**`monitor-strategies-cron`** (Backend, Cron: 1 min)
- **Purpose:** Unattended background monitoring
- **Triggers:** pg_cron every 1 minute
- **Features:**
  - Fetches all active strategies
  - Loads market data (API + DB cache)
  - Evaluates strategy conditions
  - Generates signals for all users
  - Verifies exchange positions before entry
  - Supports Binance + Bybit

**`monitor-strategies-realtime`** (Frontend, Polling: 10 sec)
- **Purpose:** User-initiated real-time monitoring
- **Triggers:** Frontend polling when enabled
- **Features:**
  - Real-time signal generation
  - Live status updates
  - User must have app open
  - Lower latency than cron

**`check-binance-positions-cron`** (Cron: 1 min)
- **Purpose:** Synchronize database state with exchange
- **Features:**
  - Checks actual exchange positions
  - Updates `strategy_live_states`
  - Logs position events
  - Prevents state drift

#### 2. Market Data Functions

**`binance-market-data`**
- Fetches historical OHLCV candles
- Supports multiple timeframes
- Caches in `market_data` table
- Returns standardized format

**`binance-ticker`**
- Real-time price tickers
- Latest price data
- Used for live price display

**`binance-websocket-monitor`**
- WebSocket connection health check
- Real-time data stream monitoring

**`get-binance-pairs`**
- Fetches available trading pairs
- Filters by quote asset (USDT)
- Used in trading pair selector

#### 3. Trading Functions

**`close-position`**
- Closes open positions on exchange
- Supports market orders
- Logs to `position_events`
- Sends Telegram notification

**`get-account-data`**
- Fetches account balance
- Retrieves open positions
- Returns margin information

**`test-exchange`**
- Tests API connectivity
- Verifies credentials
- Returns exchange time for latency check

#### 4. Signal Processing

**`calculate-indicators`**
- Server-side indicator calculation
- Supports 15+ technical indicators
- Returns indicator values for backtesting

**`process-buffered-signals`** (Cron: 5 min)
- Processes signals in `signal_buffer`
- Retries failed deliveries
- Marks signals as processed or expired
- Cleans up old entries

**`retry-failed-signals`** (Cron: 10 min)
- Retries failed Telegram notifications
- Exponential backoff strategy
- Max 3 attempts per signal
- Updates delivery status

#### 5. Testing & Health

**`test-binance`**
- Quick API connectivity test
- Returns exchange status

**`test-telegram`**
- Tests Telegram bot configuration
- Sends test message
- Verifies chat ID

**`health-check`**
- System health monitoring
- Logs to `system_health_logs`
- Used by monitoring dashboard

#### 6. Backtesting

**`run-backtest`**
- Full backtesting engine
- Simulates strategy over historical data
- Calculates performance metrics
- Stores results in `strategy_backtest_results`

**`run-backtest-simple`**
- Lightweight backtesting
- Faster execution
- Fewer metrics

### Strategy Implementation Helpers

Located in `supabase/functions/helpers/`:

**`exchange-api.ts`**
- Unified exchange abstraction layer
- Dynamic endpoint construction
- Signature generation for Binance and Bybit
- Error handling and retry logic

**`signal-utils.ts`**
- Shared signal generation utilities
- Deduplication logic
- Signal buffering
- Telegram notification sending

**`4h-reentry-strategy.ts`**
- Custom logic for 4h Reentry strategy
- Range detection and breakout logic
- Session-based entry rules

**`mstg-strategy.ts`**
- Market Sentiment Trend Gauge implementation
- Weighted scoring system
- Multiple component calculations

**`ath-guard-strategy.ts`**
- ATH Guard 1-min scalping logic
- All-Time High detection
- Volume confirmation
- Multiple take-profit levels

**`all-indicators.ts`**
- Technical indicator library
- SMA, EMA, RSI, MACD, Bollinger Bands, etc.
- Shared across all edge functions

### Function Configuration

All edge functions are configured in `supabase/config.toml`:

```toml
project_id = "wnkjtkigpyfnthnfmdlk"

[functions.monitor-strategies-realtime]
verify_jwt = true

[functions.test-exchange]
verify_jwt = true

[functions.binance-api-status]
verify_jwt = false

[functions.binance-websocket-monitor]
verify_jwt = false
```

---

## Monitoring Systems

The platform implements a **two-tier monitoring system** to balance real-time responsiveness with continuous background operation.

### Tier 1: Real-time Frontend Monitoring

**Trigger:** User-initiated via toggle switch  
**Interval:** 10 seconds  
**Edge Function:** `monitor-strategies-realtime`

**How It Works:**
1. User enables live monitoring toggle in Strategies page
2. Frontend hook (`useLiveMonitoring`) polls edge function every 10 seconds
3. Edge function evaluates all active strategies
4. Signals are generated and displayed in real-time
5. Live status indicator shows "Monitoring active" with pulse animation

**Advantages:**
- Low latency (10 seconds)
- Immediate feedback
- Real-time status updates

**Disadvantages:**
- Requires app to be open
- User-initiated
- Higher resource usage

**Code Location:**
- Frontend: `src/hooks/useLiveMonitoring.tsx`
- Edge Function: `supabase/functions/monitor-strategies-realtime/index.ts`

### Tier 2: Backend Cron Monitoring

**Trigger:** Automatic via pg_cron  
**Interval:** 1 minute  
**Edge Function:** `monitor-strategies-cron`

**How It Works:**
1. pg_cron job triggers every 1 minute
2. Edge function fetches all active strategies for all users
3. Evaluates conditions for each strategy
4. Generates signals and sends Telegram notifications
5. Updates `strategy_live_states` table
6. Logs results to console

**Advantages:**
- Works when app is closed
- No user interaction required
- Consistent monitoring for all users
- Lower per-user resource usage

**Disadvantages:**
- Higher latency (1 minute)
- No real-time UI updates
- Batch processing overhead

**Code Location:**
- Cron Definition: `supabase/migrations/*.sql` (pg_cron schedule)
- Edge Function: `supabase/functions/monitor-strategies-cron/index.ts`

### Position Verification

Before generating entry signals, both monitoring systems verify actual exchange positions:

```typescript
// Check if position exists on exchange
const positionExists = await checkExchangePosition(
  apiKey,
  apiSecret,
  useTestnet,
  strategy.symbol,
  exchangeType
);

if (positionExists === true) {
  console.log('Skipping entry - position already open on exchange');
  continue; // Skip signal generation
}
```

**Why This Matters:**
- Prevents duplicate entry signals
- Syncs database state with exchange state
- Handles manual trades or external signals
- Avoids conflicting positions

### Signal Delivery Workflow

```
┌─────────────────┐
│   Monitoring    │
│   (Tier 1/2)    │
└────────┬────────┘
         │
         │ Signal Generated
         ▼
┌─────────────────┐
│ Insert Signal   │───────────┐
│   to DB         │           │
└────────┬────────┘           │ Failed?
         │                    │
         │ Success            ▼
         ▼              ┌─────────────┐
┌─────────────────┐    │   Buffer    │
│ Send Telegram   │    │   Signal    │
│  Notification   │    └─────┬───────┘
└────────┬────────┘           │
         │                    │
         │ Success            │ Retry Later
         ▼                    │ (5 min cron)
┌─────────────────┐           │
│ Mark Delivered  │◀──────────┘
└─────────────────┘
```

**Signal Delivery Features:**
1. Primary delivery via Telegram API
2. Fallback to `signal_buffer` on failure
3. Retry logic with exponential backoff
4. Max 3 delivery attempts
5. 24-hour expiration on pending signals
6. Delivery status tracking in `strategy_signals`

### Monitoring Status Indicators

**Frontend UI:**
- 🟢 Green pulse: Monitoring active
- 🔴 Red: Monitoring stopped
- ⚠️ Yellow: Error state
- ⏸️ Gray: Paused/inactive

**Backend Logs:**
```
[CRON] Starting global strategy monitoring...
[CRON] Processing 3 active strategies...
[CRON] ✅ Generated 0 signals
```

---

## Strategy Types

The platform supports four strategy types, each with unique logic and use cases.

### 1. Standard (Indicator-Based)

**Type:** `standard`  
**Configuration:** Visual condition builder

**How It Works:**
- User defines buy and sell conditions using technical indicators
- Conditions are evaluated sequentially with AND/OR logic
- Condition groups allow complex logic trees
- Supports 15+ indicators with customizable parameters

**Supported Indicators:**
- Price action (current price vs. value)
- Moving Averages (SMA, EMA)
- Momentum indicators (RSI, Stochastic)
- Volatility indicators (Bollinger Bands, ATR)
- Trend indicators (MACD, ADX)
- Volume indicators (OBV, VWAP)

**Example Condition:**
```
BUY when:
  - RSI(14) < 30 (oversold)
  AND
  - Price crosses above EMA(50)
  
SELL when:
  - RSI(14) > 70 (overbought)
  OR
  - Price crosses below EMA(50)
```

**Configuration:**
- Indicator type
- Comparison operator
- Value or second indicator
- Lookback bars
- Confirmation bars
- Logical operators (AND/OR)

### 2. 4-Hour Reentry

**Type:** `4h_reentry`  
**Implementation:** `supabase/functions/helpers/4h-reentry-strategy.ts`

**Concept:**
Trend-following strategy that enters on pullbacks after a 4-hour range is established.

**Entry Logic:**
1. Wait for 4h candle to close (establishing a range)
2. Monitor for price to break above (long) or below (short) the 4h high/low
3. Enter on the retest/pullback
4. Set stop loss at opposite end of 4h range
5. Take profit at 2x risk

**Session Filter:**
- Only trades during New York session (configurable)
- Default: 00:00 - 03:59 EST

**Parameters:**
- `sessionStart`: Start time for trading window
- `sessionEnd`: End time for trading window
- `riskRewardRatio`: Risk/reward ratio (default: 2)

**State Management:**
- Tracks current 4h range (high/low)
- Monitors position status
- Waits for pullback confirmation

**Example:**
```
4h Candle Range: 40,000 - 42,000 BTCUSDT
Current Price: 41,500

Entry Scenarios:
  LONG: Price breaks above 42,000, then pulls back to 41,800
  SHORT: Price breaks below 40,000, then pulls back to 40,200
```

### 3. Market Sentiment Trend Gauge (MSTG)

**Type:** `market_sentiment_trend_gauge`  
**Implementation:** `supabase/functions/helpers/mstg-strategy.ts`

**Concept:**
Multi-component weighted scoring system that combines momentum, trend, volatility, and relative strength.

**Components:**
1. **Momentum (25%):** RSI, Stochastic, ROC
2. **Trend (35%):** EMA alignment, MACD, ADX
3. **Volatility (20%):** ATR, Bollinger Band width
4. **Relative Strength (20%):** Performance vs. benchmark (BTC)

**Scoring:**
- Each component scored -100 to +100
- Weighted average produces final score
- Score > threshold → LONG
- Score < -threshold → SHORT
- Score near 0 → CLOSE/NEUTRAL

**Parameters:**
- `weight_momentum`: Momentum weight (default: 0.25)
- `weight_trend`: Trend weight (default: 0.35)
- `weight_volatility`: Volatility weight (default: 0.20)
- `weight_relative`: Relative strength weight (default: 0.20)
- `long_threshold`: Score for long entry (default: 30)
- `short_threshold`: Score for short entry (default: -30)
- `exit_threshold`: Score for exit (default: 0)
- `extreme_threshold`: Score for extreme conditions (default: 60)

**Example Score Calculation:**
```
Momentum: +60 (strong bullish)
Trend: +40 (uptrend)
Volatility: -20 (expanding)
Relative: +30 (outperforming BTC)

Final Score: (60*0.25) + (40*0.35) + (-20*0.20) + (30*0.20) = +35

Action: LONG (above +30 threshold)
```

### 4. ATH Guard - 1min Scalping

**Type:** `ath_guard_scalping`  
**Implementation:** `supabase/functions/helpers/ath-guard-strategy.ts`

**Concept:**
High-frequency scalping strategy that enters on pullbacks in strong trends near all-time highs.

**Entry Logic (3 Steps):**

**Step 1: Bias Filter**
- Determine trend direction (LONG or SHORT)
- Check EMA alignment (50 > 100 > 150 for LONG)
- Verify EMA slope > threshold
- Price must be above/below EMA 150

**Step 2: Pullback Check**
- Wait for pullback to VWAP or EMA 50
- Price must pull back within tolerance (e.g., 0.15%)
- Volume must confirm (volume multiplier)

**Step 3: Entry Confirmation**
- Stochastic oversold/overbought
- RSI confirmation
- Volume spike (above average)
- ATH safety distance check

**Exit Logic:**
- Take Profit 1: 1x ATR (50% position)
- Take Profit 2: 2x ATR (remaining position)
- Stop Loss: 1.5x ATR below entry

**Parameters:**
- `ema_slope_threshold`: Min EMA slope (default: 0.15%)
- `pullback_tolerance`: Max pullback distance (default: 0.15%)
- `volume_multiplier`: Required volume increase (default: 1.8x)
- `stoch_oversold`: Stochastic oversold level (default: 25)
- `stoch_overbought`: Stochastic overbought level (default: 75)
- `atr_sl_multiplier`: ATR multiplier for stop loss (default: 1.5)
- `atr_tp1_multiplier`: ATR multiplier for TP1 (default: 1.0)
- `atr_tp2_multiplier`: ATR multiplier for TP2 (default: 2.0)
- `ath_safety_distance`: Safety distance from ATH (default: 0.2%)
- `rsi_threshold`: Max RSI for entry (default: 70)

**Timeframe:**
- Runs on 1-minute candles
- Requires fast execution
- Best for highly liquid pairs

---

## Exchange Integration

### Supported Exchanges

#### 1. Binance Futures
- **Mainnet:** `https://fapi.binance.com`
- **Testnet:** `https://testnet.binancefuture.com`
- **Features:** Perpetual futures, leverage, funding rates

#### 2. Bybit Perpetual
- **Mainnet:** `https://api.bybit.com`
- **Testnet:** `https://api-testnet.bybit.com`
- **Features:** Perpetual futures, inverse contracts

### Exchange Abstraction Layer

Located in `supabase/functions/helpers/exchange-api.ts`

**Key Features:**
1. Unified API for both exchanges
2. Dynamic endpoint construction
3. Exchange-specific signature methods
4. Consistent data parsing
5. Error handling and retries

**URL Mapping:**
```typescript
const EXCHANGE_URLS = {
  binance: {
    mainnet: 'https://fapi.binance.com',
    testnet: 'https://testnet.binancefuture.com',
  },
  bybit: {
    mainnet: 'https://api.bybit.com',
    testnet: 'https://api-testnet.bybit.com',
  },
};
```

**Interval Mapping:**
```typescript
const INTERVAL_MAPPING = {
  binance: { 
    '1m': '1m', '5m': '5m', '15m': '15m', 
    '1h': '1h', '4h': '4h', '1d': '1d' 
  },
  bybit: { 
    '1m': '1', '5m': '5', '15m': '15', 
    '1h': '60', '4h': '240', '1d': 'D' 
  },
};
```

### API Endpoints Used

#### Binance
1. **Market Data**
   - `/fapi/v1/klines` - Historical candles
   - `/fapi/v1/ticker/24hr` - 24h ticker data

2. **Account & Positions**
   - `/fapi/v2/positionRisk` - Position information
   - `/fapi/v2/balance` - Account balance

3. **Orders**
   - `/fapi/v1/order` - Place/cancel orders
   - `/fapi/v1/allOrders` - Order history

#### Bybit
1. **Market Data**
   - `/v5/market/kline` - Historical candles
   - `/v5/market/tickers` - Ticker data

2. **Account & Positions**
   - `/v5/position/list` - Position information
   - `/v5/account/wallet-balance` - Account balance

3. **Orders**
   - `/v5/order/create` - Place orders
   - `/v5/order/cancel` - Cancel orders

### Configuration in Settings

Users configure exchange settings in the Settings page:

1. **Exchange Type Selection**
   - Radio buttons: Binance or Bybit
   - Stored in `user_settings.exchange_type`

2. **API Credentials**
   - Separate mainnet and testnet keys
   - Binance: `binance_mainnet_api_key`, `binance_testnet_api_key`
   - Bybit: `bybit_mainnet_api_key`, `bybit_testnet_api_key`

3. **Testnet Toggle**
   - Switch between mainnet and testnet
   - Stored in `user_settings.use_testnet`

4. **Connection Testing**
   - "Test Connection" button
   - Verifies API credentials
   - Returns exchange server time

### Signature Generation

#### Binance
```typescript
const queryString = `symbol=${symbol}&timestamp=${timestamp}`;
const signature = hmacSHA256(queryString, apiSecret);
const url = `${baseUrl}/fapi/v2/positionRisk?${queryString}&signature=${signature}`;

headers: {
  'X-MBX-APIKEY': apiKey
}
```

#### Bybit
```typescript
const queryString = `category=linear&symbol=${symbol}&timestamp=${timestamp}`;
const signature = hmacSHA256(queryString, apiSecret);
const url = `${baseUrl}/v5/position/list?${queryString}`;

headers: {
  'X-BAPI-API-KEY': apiKey,
  'X-BAPI-TIMESTAMP': timestamp,
  'X-BAPI-SIGN': signature
}
```

---

## Deployment & Hosting

### Frontend Hosting

**Platform:** Lovable  
**Type:** Static site hosting  
**CDN:** Global edge network

**Deployment Process:**
1. Push code to connected Git repository
2. Lovable detects changes automatically
3. Builds React app with Vite
4. Deploys to CDN
5. Updates preview and production URLs

**URLs:**
- **Staging:** `https://[project-name].lovable.app`
- **Production:** Custom domain (optional)

**Build Configuration:**
- Build command: `npm run build`
- Output directory: `dist/`
- Node version: 18.x

### Backend Hosting

**Platform:** Lovable Cloud (Supabase infrastructure)  
**Components:**
- PostgreSQL database
- Edge Functions (Deno runtime)
- pg_cron scheduler
- Real-time subscriptions

**Deployment Process:**
1. Edge functions auto-deployed on code push
2. Database migrations run automatically
3. Cron jobs configured via SQL migrations
4. Environment variables managed via Lovable Cloud

**Scaling:**
- Database: Automatic connection pooling
- Edge Functions: Auto-scaling based on load
- Cron Jobs: Distributed execution

### Environment Variables

**Frontend (.env):**
```bash
VITE_SUPABASE_URL=https://wnkjtkigpyfnthnfmdlk.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
VITE_SUPABASE_PROJECT_ID=wnkjtkigpyfnthnfmdlk
```

**Backend (Edge Functions):**
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TELEGRAM_BOT_TOKEN` (user-specific, stored in DB)
- `BINANCE_API_KEY` (user-specific, stored in DB)

**Note:** All environment variables are managed automatically by Lovable Cloud. Never edit `.env` manually.

---

## Development Workflow

### Local Development Setup

```bash
# Clone repository
git clone [repository-url]
cd trading-bot-platform

# Install dependencies
npm install

# Start development server
npm run dev

# Access at http://localhost:8080
```

### Code Structure

```
trading-bot-platform/
├── src/
│   ├── components/          # React components
│   │   ├── ui/             # shadcn/ui components
│   │   ├── StrategyBuilder.tsx
│   │   ├── MonitoringStatus.tsx
│   │   └── ...
│   ├── pages/              # Page components
│   │   ├── Dashboard.tsx
│   │   ├── Strategies.tsx
│   │   ├── Backtest.tsx
│   │   ├── Settings.tsx
│   │   └── Auth.tsx
│   ├── hooks/              # Custom React hooks
│   │   ├── useAuth.tsx
│   │   ├── useLiveMonitoring.tsx
│   │   └── use-toast.ts
│   ├── lib/                # Utility functions
│   │   ├── utils.ts
│   │   └── encryption.ts
│   ├── integrations/       # Auto-generated Supabase client
│   │   └── supabase/
│   │       ├── client.ts   # ⚠️ DO NOT EDIT
│   │       └── types.ts    # ⚠️ DO NOT EDIT
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── supabase/
│   ├── config.toml         # ⚠️ DO NOT EDIT (auto-managed)
│   ├── functions/          # Edge functions
│   │   ├── monitor-strategies-cron/
│   │   ├── monitor-strategies-realtime/
│   │   ├── helpers/
│   │   │   ├── exchange-api.ts
│   │   │   ├── 4h-reentry-strategy.ts
│   │   │   ├── mstg-strategy.ts
│   │   │   └── ath-guard-strategy.ts
│   │   └── indicators/
│   │       └── all-indicators.ts
│   └── migrations/         # SQL migrations
│       └── 00000000000000_consolidated_schema.sql
├── public/
├── .env                    # ⚠️ DO NOT EDIT (auto-managed)
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.ts
└── APP_GUIDE.md           # This file
```

### Key Auto-Generated Files (DO NOT EDIT)

These files are managed by Lovable Cloud and regenerated automatically:

1. **`src/integrations/supabase/client.ts`**
   - Supabase client configuration
   - Regenerated on backend changes

2. **`src/integrations/supabase/types.ts`**
   - TypeScript types from database schema
   - Regenerated on schema changes

3. **`.env`**
   - Environment variables
   - Managed by Lovable Cloud

4. **`supabase/config.toml`**
   - Supabase project configuration
   - Edge function settings
   - Updated automatically

### Secrets Management

**Adding Secrets:**
1. Navigate to Project Settings → Secrets in Lovable Cloud
2. Click "Add Secret"
3. Enter secret name and value
4. Secret becomes available as environment variable in edge functions

**Accessing Secrets:**
```typescript
// In edge functions
const telegramToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
const binanceKey = Deno.env.get('BINANCE_API_KEY');
```

**Security:**
- Secrets are encrypted at rest
- Never logged or exposed
- Scoped to edge functions only
- Not accessible from frontend

---

## Security Considerations

### Database Security

1. **Row-Level Security (RLS)**
   - Enabled on all user-facing tables
   - Policies enforce `auth.uid()` checks
   - Service role bypasses RLS for backend operations

2. **Security Definer Functions**
   - Used for privileged operations
   - Prevents RLS recursion issues
   - Example: `has_role()` function

3. **Audit Logging**
   - `user_settings_audit` tracks credential access
   - `security_audit_log` for system events
   - IP address and user agent logging

4. **Optimistic Locking**
   - `strategy_live_states` uses version column
   - Prevents concurrent update conflicts
   - Ensures data consistency

### API Key Security

1. **Storage**
   - Encrypted at rest in PostgreSQL
   - Separate mainnet/testnet credentials
   - Never exposed to frontend

2. **Access Control**
   - Retrieved via security definer functions
   - All access logged to audit table
   - RLS policies enforce user ownership

3. **Transmission**
   - HTTPS only
   - Never in URL parameters
   - Sent in request headers only

### Authentication Security

1. **JWT Tokens**
   - Short-lived access tokens
   - Refresh token rotation
   - Stored in localStorage (XSS protection via CSP)

2. **Password Security**
   - Handled by Supabase Auth
   - Bcrypt hashing
   - No plaintext storage

3. **Session Management**
   - Auto-refresh before expiration
   - Graceful handling of expired sessions
   - Session invalidation on logout

### Input Validation

1. **Frontend Validation**
   - Zod schemas for all forms
   - Type checking with TypeScript
   - Min/max length constraints

2. **Backend Validation**
   - Double validation in edge functions
   - SQL injection prevention via parameterized queries
   - Rate limiting on API endpoints

3. **Example:**
   ```typescript
   const strategySchema = z.object({
     name: z.string().min(1).max(100),
     symbol: z.string().regex(/^[A-Z]{4,10}$/),
     timeframe: z.enum(['1m', '5m', '15m', '1h', '4h', '1d']),
   });
   ```

### Rate Limiting

1. **Exchange API Limits**
   - Binance: 1200 requests/minute
   - Bybit: 120 requests/minute
   - Retry logic with exponential backoff

2. **Edge Function Limits**
   - Supabase default limits apply
   - Concurrent execution limits
   - Memory and CPU constraints

3. **Database Limits**
   - Connection pooling
   - Query timeout (30 seconds)
   - Row limit on large queries

---

## Troubleshooting Guide

### Common Issues & Solutions

#### 1. "Session Expired" Error

**Symptoms:**
- Automatic redirect to `/auth`
- "Your session has expired" message
- Inability to access protected routes

**Solutions:**
1. **Temporary:** Sign out and sign in again
2. **Permanent Fix:** Check auto-refresh configuration
   ```typescript
   // In src/integrations/supabase/client.ts
   export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
     auth: {
       autoRefreshToken: true, // ✅ Should be true
       persistSession: true,
     }
   });
   ```

**Prevention:**
- Keep app open in active tab (prevents token expiry)
- Enable "Remember me" if available
- Check for network connectivity issues

---

#### 2. Strategy Not Generating Signals

**Symptoms:**
- Strategy status is "active" but no signals appear
- No errors in console
- Monitoring shows as running

**Diagnostic Steps:**

**Step 1: Check Strategy Status**
```sql
SELECT id, name, status, symbol, timeframe 
FROM strategies 
WHERE user_id = auth.uid();
```
- Status must be `'active'`
- Symbol and timeframe should match exchange data

**Step 2: Check Live Monitoring**
- Frontend monitoring: Toggle must be ON
- Backend cron: Check system_settings
  ```sql
  SELECT * FROM system_settings 
  WHERE setting_key = 'monitoring_enabled';
  ```

**Step 3: Verify Conditions**
```sql
SELECT * FROM strategy_conditions 
WHERE strategy_id = '[your-strategy-id]';
```
- At least 1 buy condition required
- Check indicator values are realistic
- Verify operators are correct

**Step 4: Check Exchange API Keys**
- Settings → Exchange API Keys
- Use "Test Connection" button
- Verify mainnet vs. testnet setting

**Step 5: Review Edge Function Logs**
- Open backend logs for `monitor-strategies-cron`
- Look for strategy processing logs
- Check for error messages

**Common Causes:**
- ❌ Invalid API keys
- ❌ Wrong testnet/mainnet setting
- ❌ Conditions never met (too strict)
- ❌ Trading pair not available on exchange
- ❌ Monitoring disabled in system settings

---

#### 3. Telegram Notifications Not Received

**Symptoms:**
- Signals generated but no Telegram messages
- "Telegram sent: false" in position_events
- Signal status stuck at "pending"

**Diagnostic Steps:**

**Step 1: Verify Telegram Configuration**
1. Settings → Telegram Configuration
2. Check:
   - ✅ Telegram enabled toggle is ON
   - ✅ Bot token is correct (format: `1234567890:ABCdefGHIjklMNOpqrsTUVwxyz`)
   - ✅ Chat ID is correct (format: `123456789` or `-1001234567890`)

**Step 2: Test Connection**
1. Click "Test Connection" button
2. Should receive test message
3. If fails, check:
   - Bot is not blocked
   - Bot was started (`/start` command)
   - Chat ID matches the chat where you messaged the bot

**Step 3: Get Chat ID**
If you don't know your chat ID:
1. Message your bot: `/start`
2. Visit: `https://api.telegram.org/bot[YOUR_BOT_TOKEN]/getUpdates`
3. Look for `"chat":{"id":123456789}`
4. Copy the ID value

**Step 4: Check Signal Buffer**
```sql
SELECT * FROM signal_buffer 
WHERE processed = false 
ORDER BY buffered_at DESC 
LIMIT 10;
```
- Unprocessed signals will be retried by cron job

**Step 5: Check Delivery Attempts**
```sql
SELECT signal_type, symbol, status, delivery_attempts, error_message
FROM strategy_signals 
WHERE user_id = auth.uid()
ORDER BY created_at DESC 
LIMIT 10;
```
- `delivery_attempts` > 3 means signal expired
- Check `error_message` for details

**Common Causes:**
- ❌ Wrong bot token
- ❌ Wrong chat ID
- ❌ Bot blocked by user
- ❌ Bot not started (`/start` command)
- ❌ Telegram API rate limits
- ❌ Network connectivity issues

---

#### 4. Exchange API Connection Failed

**Symptoms:**
- "Failed to fetch account data" error
- "API connection test failed" message
- Strategies can't fetch market data

**Diagnostic Steps:**

**Step 1: Verify API Keys**
1. Go to Settings → Exchange API Keys
2. Check:
   - ✅ API key and secret are not empty
   - ✅ Keys are correct (no typos)
   - ✅ Keys are for correct exchange (Binance vs. Bybit)

**Step 2: Check Testnet Toggle**
- If using testnet keys, testnet toggle must be ON
- If using mainnet keys, testnet toggle must be OFF
- Mismatched settings cause authentication failures

**Step 3: Verify API Key Permissions**

**For Binance:**
- Required permissions: "Enable Futures", "Enable Reading", "Enable Spot & Margin Trading"
- IP restrictions: Must allow all IPs or add Lovable Cloud IPs
- Check at: https://www.binance.com/en/my/settings/api-management

**For Bybit:**
- Required permissions: "Contract Trade", "Position", "Account Info"
- IP restrictions: Must allow all IPs or whitelist
- Check at: https://www.bybit.com/app/user/api-management

**Step 4: Test Connection**
1. Click "Test Connection" button in Settings
2. Should return exchange server time
3. If fails:
   - Check error message
   - Verify exchange is not under maintenance
   - Check internet connectivity

**Step 5: Check Rate Limits**
- Binance: 1200 requests/minute
- Bybit: 120 requests/minute
- Wait 1 minute if rate limited

**Common Causes:**
- ❌ Invalid API keys
- ❌ Insufficient API permissions
- ❌ IP restriction blocking Lovable Cloud
- ❌ Testnet/mainnet mismatch
- ❌ Exchange under maintenance
- ❌ Rate limit exceeded

---

#### 5. Position Not Detected

**Symptoms:**
- Manual trade opened on exchange
- Strategy still generating entry signals
- Position not reflected in dashboard

**Diagnostic Steps:**

**Step 1: Check Position on Exchange**
1. Log into exchange (Binance/Bybit)
2. Navigate to Positions
3. Verify position exists for the symbol

**Step 2: Wait for Synchronization**
- Backend cron job runs every 1 minute
- Position sync via `check-binance-positions-cron`
- Wait at least 2 minutes for sync

**Step 3: Check Strategy Live State**
```sql
SELECT strategy_id, position_open, entry_price, entry_time
FROM strategy_live_states
WHERE user_id = auth.uid();
```
- `position_open` should be `true` if position exists
- `entry_price` should match exchange entry

**Step 4: Manual Sync (if needed)**
Temporarily stop and restart the strategy:
1. Set strategy status to 'paused'
2. Wait 1 minute
3. Set strategy status to 'active'
4. Next cron run will re-sync

**Step 5: Check Position Events**
```sql
SELECT * FROM position_events
WHERE user_id = auth.uid()
ORDER BY timestamp DESC
LIMIT 5;
```
- Look for recent 'position_opened' events
- Check if position close was logged

**Common Causes:**
- ⏱️ Sync delay (wait 1-2 minutes)
- ❌ API keys don't have position read permission
- ❌ Position opened on different exchange
- ❌ Position opened on spot instead of futures
- ❌ Cron job temporarily failed

---

#### 6. Backtest Not Running

**Symptoms:**
- "Run Backtest" button does nothing
- Backtest never completes
- No results displayed

**Diagnostic Steps:**

**Step 1: Check Browser Console**
1. Open DevTools (F12)
2. Go to Console tab
3. Look for error messages
4. Common errors:
   - Network errors (edge function timeout)
   - Auth errors (session expired)
   - Data errors (insufficient candles)

**Step 2: Verify Date Range**
- Start date must be before end date
- Date range should be reasonable (not >1 year for 1m timeframe)
- Check if market data exists for date range

**Step 3: Check Market Data Availability**
```sql
SELECT MIN(open_time), MAX(open_time), COUNT(*) 
FROM market_data
WHERE symbol = 'BTCUSDT' 
  AND timeframe = '1h';
```
- If count is low, data may need to be fetched

**Step 4: Check Edge Function Logs**
- Look for `run-backtest` or `run-backtest-simple` logs
- Check for timeout errors (>30 seconds)
- Look for memory limit errors

**Step 5: Try Simpler Backtest**
- Reduce date range (1 week instead of 1 month)
- Use higher timeframe (1h instead of 1m)
- Use `run-backtest-simple` instead of full backtest

**Common Causes:**
- ❌ Date range too large (timeouts)
- ❌ Insufficient market data
- ❌ Complex strategy (too many conditions)
- ❌ Edge function timeout (30s limit)
- ❌ Session expired during backtest

---

#### 7. Dashboard Not Loading

**Symptoms:**
- White screen or loading spinner forever
- "Failed to fetch strategies" error
- Blank dashboard with no data

**Diagnostic Steps:**

**Step 1: Check Authentication**
1. Verify you're logged in (check `/auth` redirect)
2. Check browser console for auth errors
3. Try refreshing the page

**Step 2: Check Network Requests**
1. Open DevTools → Network tab
2. Refresh page
3. Look for failed requests (red)
4. Check status codes:
   - 401: Authentication issue
   - 403: Permission denied
   - 500: Server error

**Step 3: Check Database Queries**
```sql
-- Verify strategies exist
SELECT COUNT(*) FROM strategies WHERE user_id = auth.uid();

-- Verify user settings exist
SELECT * FROM user_settings WHERE user_id = auth.uid();

-- Check for data corruption
SELECT id, name, status FROM strategies WHERE user_id = auth.uid();
```

**Step 4: Clear Browser Cache**
1. Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
2. Clear localStorage:
   ```javascript
   // In browser console
   localStorage.clear();
   window.location.reload();
   ```

**Step 5: Check Supabase Connection**
- Verify Supabase is not under maintenance
- Check project status in Lovable Cloud dashboard
- Test with a simple query

**Common Causes:**
- ❌ Expired session
- ❌ Corrupted localStorage
- ❌ Database connection issues
- ❌ RLS policy blocking queries
- ❌ Missing user_settings record

---

### Getting More Help

**Check Logs:**
1. **Frontend Logs:** Browser DevTools → Console
2. **Edge Function Logs:** Lovable Cloud → Functions → Select function → Logs
3. **Database Logs:** Lovable Cloud → Database → Logs

**Debug Mode:**
Enable debug logging in edge functions:
```typescript
const DEBUG = true;
if (DEBUG) console.log('[DEBUG]', data);
```

**Contact Support:**
- Discord: https://discord.com/channels/1119885301872070706/1280461670979993613
- Docs: https://docs.lovable.dev

---

## Performance Optimization

### Frontend Optimization

1. **React Query Caching**
   ```typescript
   const { data } = useQuery({
     queryKey: ['strategies'],
     queryFn: fetchStrategies,
     staleTime: 5 * 60 * 1000, // 5 minutes
     cacheTime: 10 * 60 * 1000, // 10 minutes
   });
   ```

2. **Lazy Loading**
   ```typescript
   const Backtest = lazy(() => import('@/pages/Backtest'));
   const Settings = lazy(() => import('@/pages/Settings'));
   ```

3. **Debounced Inputs**
   ```typescript
   const debouncedSearch = useDebouncedCallback(
     (value) => setSearchTerm(value),
     300
   );
   ```

4. **Virtual Scrolling**
   - Used in trade log tables
   - Renders only visible rows
   - Handles 1000+ rows efficiently

### Backend Optimization

1. **Database Indexes**
   ```sql
   CREATE INDEX idx_strategies_user_id ON strategies(user_id);
   CREATE INDEX idx_strategy_signals_created_at ON strategy_signals(created_at DESC);
   ```

2. **Query Optimization**
   - Use `SELECT` with specific columns (not `*`)
   - Add `LIMIT` clauses where appropriate
   - Use composite indexes for common queries

3. **Candle Data Caching**
   - Historical candles stored in `market_data` table
   - API only fetches latest 100 candles
   - Merged with DB cache for full history

4. **Connection Pooling**
   - Supabase handles automatic connection pooling
   - Edge functions reuse connections
   - No manual connection management needed

### Monitoring Optimization

1. **Two-Tier System**
   - Frontend: 10-second polling (user-initiated)
   - Backend: 1-minute cron (always running)
   - Reduces database load

2. **Batch Processing**
   - Cron job processes all strategies in one run
   - Shared market data fetch
   - Reduced API calls

3. **Deduplication**
   - Signal hash prevents duplicate signals
   - Last processed candle time tracking
   - Skips already processed data

---

## Future Enhancements

### Planned Features

#### 1. Paper Trading Mode
- Simulated trading without real funds
- Risk-free strategy testing
- Performance tracking
- Leaderboards

#### 2. Advanced Backtesting
- Walk-forward optimization
- Monte Carlo simulation
- Multi-timeframe backtesting
- Machine learning insights

#### 3. Portfolio Management
- Multi-strategy portfolios
- Risk allocation
- Correlation analysis
- Portfolio rebalancing

#### 4. Risk Analytics Dashboard
- Real-time risk metrics
- Value at Risk (VaR)
- Sharpe/Sortino ratios
- Drawdown analysis

#### 5. Multi-Strategy Coordination
- Strategy dependencies
- Signal aggregation
- Portfolio-level position limits
- Risk-adjusted position sizing

#### 6. Custom Indicator Builder
- Visual indicator creator
- Custom formula support
- Indicator library sharing
- Backtesting with custom indicators

#### 7. Strategy Marketplace
- Share strategies with community
- Rate and review strategies
- Purchase premium strategies
- Strategy performance verification

#### 8. Mobile App
- iOS and Android apps
- Push notifications
- Quick strategy enable/disable
- Real-time portfolio tracking

#### 9. Advanced Order Types
- Trailing stop loss
- OCO (One-Cancels-Other) orders
- Iceberg orders
- Time-weighted orders

#### 10. Social Trading
- Follow top traders
- Copy trades automatically
- Social proof and ratings
- Community leaderboards

---

## Support & Resources

### Documentation Links

**Lovable Platform:**
- Main Docs: https://docs.lovable.dev
- Quickstart: https://docs.lovable.dev/user-guides/quickstart
- Cloud Features: https://docs.lovable.dev/features/cloud
- AI Features: https://docs.lovable.dev/features/ai

**Supabase (Backend):**
- Main Docs: https://supabase.com/docs
- Auth: https://supabase.com/docs/guides/auth
- Database: https://supabase.com/docs/guides/database
- Edge Functions: https://supabase.com/docs/guides/functions
- Realtime: https://supabase.com/docs/guides/realtime

**Exchange APIs:**
- Binance Futures: https://binance-docs.github.io/apidocs/futures/en/
- Bybit API: https://bybit-exchange.github.io/docs/v5/intro
- Telegram Bot API: https://core.telegram.org/bots/api

### Video Tutorials

**Lovable Playlist:**
- Build a Fullstack App: https://www.youtube.com/watch?v=9KHLTZaJcR8&list=PLbVHz4urQBZkJiAWdG8HWoJTdgEysigIO

### Community Support

**Discord:**
- Lovable Community: https://discord.com/channels/1119885301872070706/1280461670979993613
- Ask questions, share projects, get help

### Technical Support

**For Issues:**
1. Check this guide's Troubleshooting section
2. Review console logs and edge function logs
3. Search Discord for similar issues
4. Post in Discord with:
   - Description of issue
   - Steps to reproduce
   - Screenshots/logs
   - Browser and OS info

**For Bugs:**
1. Confirm it's reproducible
2. Check if already reported in Discord
3. Report with:
   - Expected vs. actual behavior
   - Reproduction steps
   - Environment details
   - Console/edge function logs

---

## Appendix

### Glossary

- **ATH:** All-Time High - Highest price ever reached
- **EMA:** Exponential Moving Average
- **RLS:** Row-Level Security (database)
- **SMA:** Simple Moving Average
- **OHLCV:** Open, High, Low, Close, Volume (candle data)
- **Edge Function:** Serverless function (Deno runtime)
- **Cron Job:** Scheduled task (using pg_cron)
- **Signal:** Trading alert (buy/sell/close)
- **Leverage:** Borrowed funds to amplify trading position
- **Futures:** Derivative contract to buy/sell at future date
- **Perpetual:** Futures contract with no expiry

### Changelog

**v1.0.0 (2025-10-15)**
- Initial architecture documentation
- Comprehensive troubleshooting guide
- Security best practices
- Performance optimization tips

---

**End of APP_GUIDE.md**

For questions or updates, contact the development team via Discord or check the latest documentation at https://docs.lovable.dev
