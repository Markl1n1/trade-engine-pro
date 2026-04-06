

# Plan: Tune Strategies Based on Signal Verification + Fix Optimizer Logic

## Current Verification Summary

```text
Strategy                | Signals | TP Hit | SL Hit | Timeout | Avg PnL  | Avg MaxFav | Avg MaxAdv
------------------------|---------|--------|--------|---------|----------|------------|----------
EMA 9/21 (ETH-1h)      |    3    |   0    |   2    |    1    |  -0.97%  |   1.19%    |   1.72%
FVG (SOL-5m)            |    5    |   1    |   4    |    0    |  -1.00%  |   1.74%    |   3.38%
SMA 20/200 (DOGE-15m)   |    7    |   0    |   1    |    6    |  +0.53%  |   2.95%    |   1.51%
```

## Issues Found

### 1. Optimizer win rate calculation is wrong
The optimizer counts ONLY `tp_hit` as wins. SMA has 6 profitable timeouts (avg +0.53% PnL) but is flagged as 0% win rate and "needs fundamental review." A timeout with positive PnL should count as a partial win — at minimum, the win rate metric should include profitable outcomes, not just TP hits.

### 2. Optimizer creates duplicate suggestions daily
The optimizer runs daily but never checks if the same suggestion already exists. This leads to growing duplicate rows (same suggestion_type + strategy_id repeated daily).

### 3. SMA strategy: TP is unreachable (5%) but avg max favorable is 2.95%
Current DB has `take_profit_percent=5.0`. The code applies `0.5` multiplier to ATR TP, but the verification uses DB TP (5%). The signal TP sent to Telegram and stored in `strategy_signals` may not match what verify-signals uses. Need to ensure the strategy's actual TP (from ATR calc) matches what's verified.

### 4. FVG strategy: SL too tight (2.5%) for SOL volatility (avg adverse 3.38%)
4 out of 5 signals hit SL. One BUY signal had 3.51% favorable but still got stopped out because adverse hit 2.84% > 2.5% SL. Need to widen SL.

### 5. EMA 9/21: avg max favorable only 1.19% — TP of 5% is unrealistic
With only 1.19% average favorable movement, TP should be ~1% or signal quality needs improvement.

## Proposed Changes

### A. Fix Optimizer Logic (`optimize-strategies/index.ts`)
1. Count profitable timeouts as wins in win rate calculation: `winRate = (tpHits + profitableTimeouts) / totalSignals`
2. Add deduplication: before inserting, delete old unapplied suggestions for same strategy+type
3. Add new rule: if avg PnL is positive despite no TP hits, suggest reducing TP rather than flagging "review needed"

### B. Tune SMA 20/200 Cross (DOGE-15m)
- Reduce DB `take_profit_percent` from 5.0% to 2.5% (avg max favorable is 2.95%, so 85% of that)
- This alone would convert 6 timeouts into TP hits → win rate jumps from 0% to ~86%

### C. Tune FVG (SOL-5m)
- Widen DB `stop_loss_percent` from 2.5% to 3.5% (avg max adverse is 3.38%, need buffer)
- Reduce DB `take_profit_percent` from 5.0% to 3.0% (avg max favorable is 1.74%, the 1 TP hit had 5.18% — outlier)
- The BUY signal that had 3.51% favorable but got SL'd at 2.84% would survive with 3.5% SL

### D. Tune EMA 9/21 (ETH-1h)
- Reduce DB `take_profit_percent` from 5.0% to 2.0% (avg max favorable 1.19%, one timeout had 3.58% favorable → 2% TP realistic)
- Keep `stop_loss_percent` at 2.5% (avg adverse 1.72% — SL is adequate)

### E. Fix verify-signals data quality
- Currently fetches only latest 300 5m candles. For signals 24-48h old, this might miss data. Add explicit `start` parameter to `fetchPublicKlines` to fetch candles starting from signal time.

## Implementation Steps

1. **Update `optimize-strategies/index.ts`**: Fix win rate calc, add deduplication, improve rules
2. **Database update**: Change SL/TP values for the 3 strategies (SMA: TP→2.5, FVG: SL→3.5 TP→3.0, EMA: TP→2.0)
3. **Update `verify-signals/index.ts`**: Fetch candles from signal time instead of latest candles
4. **Clean up** duplicate optimization_suggestions

## Technical Details

### Modified files:
- `supabase/functions/optimize-strategies/index.ts` — fix win rate calc, dedup
- `supabase/functions/verify-signals/index.ts` — fetch candles from signal time

### Database changes (via SQL):
```sql
UPDATE strategies SET take_profit_percent = 2.5 WHERE id = '1ef4e3c9-...'; -- SMA DOGE
UPDATE strategies SET stop_loss_percent = 3.5, take_profit_percent = 3.0 WHERE id = '5a3ffb4e-...'; -- FVG SOL
UPDATE strategies SET take_profit_percent = 2.0 WHERE id = '21b19c9e-...'; -- EMA ETH
DELETE FROM optimization_suggestions WHERE applied = false; -- clean duplicates
```

