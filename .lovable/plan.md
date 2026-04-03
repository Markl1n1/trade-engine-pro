

# Plan: Signal Verification-Driven Strategy Improvements

## Analysis of Verification Data

The verification data reveals clear patterns across all 11 verified signals:

```text
Strategy                      | Signals | TP Hit | SL Hit | Timeout | Win Rate | Avg PnL
------------------------------|---------|--------|--------|---------|----------|--------
EMA 9/21 (ETHUSDT)            |    2    |   0    |   2    |    0    |   0%     | -2.50%
FVG (SOL-5m)                  |    4    |   0    |   4    |    0    |   0%     | -2.50%
SMA 20/200 Cross (DOGE-15m)   |    5    |   0    |   1    |    4    |   0%     | +0.27%
```

### Root Causes Identified

1. **SELL signals against uptrend**: EMA 9/21 shorted ETH (max_favorable = 0% on both signals — price never moved down). FVG shorted SOL 3 times with max_favorable = 0%.

2. **TP too ambitious (5%)**: SMA signals show price moves 2.5-3.7% in favor but TP is at 5%. Four SMA signals ended as profitable timeouts (avg +0.27%) — they would have been TP wins with a 3% target.

3. **SL too tight for volatile assets**: FVG on SOL 5m has 2.5% SL but SOL routinely moves 4-6% adverse (max_adverse up to 6.16%). One BUY signal had 3.51% favorable but got stopped out first.

## Proposed Improvements (3 areas)

### 1. Auto-Feedback Loop: Strategy Parameter Optimizer

Create a new edge function `optimize-strategies` that reads `signal_verifications` data and automatically suggests (or applies) parameter adjustments.

**Logic:**
- If avg `max_favorable` < current TP → reduce TP to 80% of avg max_favorable
- If avg `max_adverse` > current SL and win_rate < 30% → widen SL to 110% of avg max_adverse
- If >70% of losing signals are counter-trend (SELL when price only went up) → flag for trend filter enforcement

**Implementation:** New edge function + a "Strategy Optimizer" UI card on Dashboard showing recommendations.

### 2. Higher-Timeframe Trend Gate in All Strategies

Add a mandatory higher-timeframe trend check before every signal. Currently strategies use confidence modifiers — but verification proves that counter-trend signals have 0% success.

**Rule:** If the 1h EMA 50 slope is negative, block all LONG signals. If positive, block all SHORT signals. This is a hard block, not a confidence modifier, because verification data shows 0% win rate on counter-trend entries.

**Files to modify:**
- `ema-crossover-scalping-strategy.ts` — add 1h trend gate
- `fvg-scalping-strategy.ts` — add 1h trend gate
- `sma-crossover-strategy.ts` — add 1h trend gate

### 3. Dynamic TP/SL Based on Verification History

Update strategy configs in the database based on verification insights:

| Strategy | Current SL/TP | Recommended SL/TP | Reason |
|----------|--------------|-------------------|--------|
| EMA 9/21 | 2.5%/5.0% | 2.5%/3.0% | Max favorable never exceeds 0% on counter-trend; with trend gate, 3% TP is realistic |
| FVG SOL | 2.5%/5.0% | 3.5%/3.5% | SOL volatility needs wider SL; TP 5% never reached |
| SMA DOGE | 2.5%/5.0% | 2.5%/3.0% | Avg max favorable = 2.61%, 4/5 signals would have hit 3% TP |

### 4. Verification-Enriched Signal Metadata

Store additional context with each signal (RSI value, trend direction, volatility at entry) in `strategy_signals.reason` field. This enables the optimizer to correlate which conditions produce winning vs losing trades.

## Implementation Steps

1. **Database migration**: Add `optimization_suggestions` table to store auto-generated recommendations
2. **Create `optimize-strategies` edge function**: Reads verification data, computes optimal SL/TP/filters, writes suggestions
3. **Add trend gate to 3 strategy files**: Hard block counter-trend signals using fetchPublicKlines for 1h data
4. **Update strategy DB configs**: Adjust SL/TP values per the table above
5. **Add "Strategy Optimizer" card to Dashboard**: Shows latest recommendations with one-click apply
6. **Schedule cron**: Run optimizer daily after verify-signals completes (15:00 UTC)

## Technical Details

### New files:
- `supabase/functions/optimize-strategies/index.ts`
- `src/components/StrategyOptimizerCard.tsx`

### Modified files:
- `supabase/functions/helpers/ema-crossover-scalping-strategy.ts` — trend gate
- `supabase/functions/helpers/fvg-scalping-strategy.ts` — trend gate  
- `supabase/functions/helpers/sma-crossover-strategy.ts` — trend gate
- `src/pages/Dashboard.tsx` — add optimizer card

### New table:
```sql
CREATE TABLE optimization_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id uuid NOT NULL,
  user_id uuid NOT NULL,
  suggestion_type text NOT NULL, -- 'sl_adjust', 'tp_adjust', 'add_filter', 'remove_filter'
  current_value jsonb,
  suggested_value jsonb,
  reason text,
  based_on_signals integer, -- number of verified signals used
  applied boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
```

