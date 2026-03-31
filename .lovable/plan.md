

# Plan: 4 Tasks — Cleanup, Signal Verifier, Admin Account, Strategy Audit

---

## Task 1: Clean market_data to last 4 months

**What:** Run a one-time DELETE on `market_data` to remove records older than 4 months, then update the `cleanup-market-data` edge function to use 120 days instead of 90.

**Steps:**
1. Use the **insert tool** (SQL) to delete old records:
   ```sql
   DELETE FROM market_data WHERE created_at < NOW() - INTERVAL '4 months';
   ```
2. Update `supabase/functions/cleanup-market-data/index.ts` — change `90` days to `120` days to match going forward.

---

## Task 2: Signal Verification Tool (post-hoc trade checker)

**What:** A new edge function `verify-signals` that runs daily via cron. For each signal sent in the last 24h, it fetches Bybit Mainnet kline data for the period after the signal, simulates the trade using entry price + SL/TP, and records the outcome.

### Database changes (migration):
```sql
CREATE TABLE signal_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id uuid NOT NULL,
  strategy_id uuid NOT NULL,
  user_id uuid NOT NULL,
  symbol text NOT NULL,
  signal_type text NOT NULL,
  entry_price numeric NOT NULL,
  stop_loss numeric,
  take_profit numeric,
  signal_time timestamptz NOT NULL,
  verified_at timestamptz DEFAULT now(),
  outcome text NOT NULL DEFAULT 'pending', -- 'tp_hit', 'sl_hit', 'timeout', 'pending'
  exit_price numeric,
  pnl_percent numeric,
  max_favorable numeric, -- max price in favor
  max_adverse numeric,   -- max price against
  time_to_exit_minutes integer,
  candles_checked integer,
  verification_period_hours integer DEFAULT 24,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE signal_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own verifications"
  ON signal_verifications FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert verifications"
  ON signal_verifications FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role can update verifications"
  ON signal_verifications FOR UPDATE
  USING (true);
```

### Edge function `verify-signals/index.ts`:
- Query `strategy_signals` for signals created 24-48h ago (gives time for trades to resolve)
- For each signal, fetch 1m Bybit Mainnet klines using `fetchPublicKlines('bybit', symbol, '1m', 1000, false)` from `exchange-api.ts`
- Simulate: iterate candles checking if high/low hit TP or SL
- Record outcome in `signal_verifications`
- Send Telegram summary: "X signals verified: Y TP hit, Z SL hit, W timeout"

### Cron schedule:
- Run daily at 14:00 UTC (after scheduled backtests)

### UI:
- Add a "Signal Verification" section on the Dashboard or a new page showing verification results with accuracy stats

---

## Task 3: Add admin role for nicknnlmix@gmail.com

**What:** The `handle_new_user` trigger auto-assigns roles on signup. For an existing user, we need to INSERT a role.

**Steps:**
1. Use the **insert tool** to find the user and add admin role:
   ```sql
   INSERT INTO user_roles (user_id, role)
   SELECT id, 'admin' FROM auth.users WHERE email = 'nicknnlmix@gmail.com'
   ON CONFLICT (user_id, role) DO NOTHING;
   ```
   (Note: if the user hasn't signed up yet, we'll need to wait for them to register first, then run this)

---

## Task 4: Strategy & Backtest Correctness Audit

**What:** Review strategy implementations against Bybit Mainnet API data flow and fix any issues found.

### Key areas to verify and fix:

1. **Telegram signaler uses raw bot token URL** — `enhanced-telegram-signaler.ts` line 297 calls `https://api.telegram.org/bot${botToken}/sendMessage` directly. If a Telegram connector is set up, this should use the gateway. Currently no connector is linked, so this works but depends on user storing `telegram_bot_token` in `user_settings`. This is fine as-is.

2. **Data source for backtests vs live** — `run-backtest` and `monitor-strategies-cron` both use `fetchPublicKlines` from `exchange-api.ts` which hits Bybit Mainnet public API. This ensures parity between backtest data and live monitoring data. **Correct.**

3. **SL/TP calculation parity** — Per memory, SL/TP are pure price movement (not leveraged). Need to verify each strategy helper uses consistent calculation. Will audit `ath-guard-strategy.ts`, `mtf-momentum-strategy.ts`, `sma-crossover-strategy.ts`, `ema-crossover-scalping-strategy.ts`, `4h-reentry-strategy.ts` for:
   - Config loaded from DB (not hardcoded)
   - SL/TP applied as price % not leveraged %
   - Same indicator periods in backtest vs monitor

4. **signal_references table may not exist** — `enhanced-telegram-signaler.ts` inserts into `signal_references` but this table isn't in the current schema. This silently fails. Will create the table in the migration for Task 2.

5. **market_data RLS blocks DELETE** — The cleanup function uses service role key, so this is fine. But the RLS policy doesn't allow DELETE for regular users. Service role bypasses RLS. **Correct.**

### Fixes to apply:
- Create `signal_references` table if missing (migration)
- Verify and document that all strategy config loading uses `getStrategyBacktestConfig` / `getStrategyMonitorConfig` from `strategy-config-loader.ts`
- Add validation log in `monitor-strategies-cron` confirming config values match DB

---

## Technical Details

### Files to create:
- `supabase/functions/verify-signals/index.ts` — Signal verification cron function

### Files to modify:
- `supabase/functions/cleanup-market-data/index.ts` — Change retention to 120 days
- `supabase/functions/helpers/enhanced-telegram-signaler.ts` — Minor fixes if needed
- `src/pages/Dashboard.tsx` or new page — Signal verification results UI

### Database:
- Migration: `signal_verifications` table + `signal_references` table
- Insert: DELETE old market_data, INSERT admin role, INSERT cron job for verify-signals

### Cron job (insert tool):
```sql
SELECT cron.schedule(
  'verify-signals-daily',
  '0 14 * * *',
  $$
  SELECT net.http_post(
    url:='https://wnkjtkigpyfnthnfmdlk.supabase.co/functions/v1/verify-signals',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer <anon_key>"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);
```

