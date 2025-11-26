-- Phase 1: Critical parameter fixes for improved win rates
-- Based on backtest analysis showing excessive filters and tight stop losses

-- MTF Momentum: Increase SL/TP (was too tight at 1%)
UPDATE strategies 
SET 
  stop_loss_percent = 2.5,
  take_profit_percent = 5.0
WHERE strategy_type = 'mtf_momentum';

-- ATH Guard: Remove ADX blocking filter, extend position time
UPDATE strategies 
SET 
  adx_threshold = NULL,  -- Remove ADX as blocker
  max_position_time = 120  -- Extend to 2 hours (was 30-60)
WHERE strategy_type = 'ath_guard_scalping';

-- FVG & 4H Reentry: Relax ADX and volume requirements
UPDATE strategies 
SET 
  adx_threshold = 15,  -- Lower from 20
  volume_multiplier = 0.8  -- Lower from 1.0+
WHERE strategy_type IN ('fvg_scalping', '4h_reentry');