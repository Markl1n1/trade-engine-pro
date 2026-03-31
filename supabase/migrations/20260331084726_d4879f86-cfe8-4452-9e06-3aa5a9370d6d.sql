CREATE TABLE IF NOT EXISTS signal_verifications (
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
  outcome text NOT NULL DEFAULT 'pending',
  exit_price numeric,
  pnl_percent numeric,
  max_favorable numeric,
  max_adverse numeric,
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

CREATE TABLE IF NOT EXISTS signal_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id text NOT NULL,
  user_id uuid NOT NULL,
  strategy_id uuid NOT NULL,
  symbol text NOT NULL,
  signal_type text NOT NULL,
  price numeric NOT NULL,
  timestamp timestamptz NOT NULL,
  trading_mode text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE signal_references ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own signal references"
  ON signal_references FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert signal references"
  ON signal_references FOR INSERT
  WITH CHECK (true);