import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Sparkles, AlertTriangle, CheckCircle, XCircle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { logStrategyCreate, logStrategyEdit } from "@/utils/auditLogger";

interface StrategyBuilderProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  editStrategy?: any;
}

interface ValidationErrors {
  [key: string]: string;
}

export const StrategyBuilder = ({ open, onOpenChange, onSuccess, editStrategy }: StrategyBuilderProps) => {
  // Basic Settings
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [timeframe, setTimeframe] = useState("1h");
  const [strategyType, setStrategyType] = useState("sma_crossover");
  const [status, setStatus] = useState("active");
  const [initialCapital, setInitialCapital] = useState(1000);
  const [positionSizePercent, setPositionSizePercent] = useState(5);
  const [benchmarkSymbol, setBenchmarkSymbol] = useState("BTCUSDT");

  // Risk Management
  const [stopLossPercent, setStopLossPercent] = useState(1);
  const [takeProfitPercent, setTakeProfitPercent] = useState(2);
  const [trailingStopPercent, setTrailingStopPercent] = useState(0.5);
  const [maxPositionTime, setMaxPositionTime] = useState(240);
  const [minProfitPercent, setMinProfitPercent] = useState(0.2);

  // General Filters
  const [rsiPeriod, setRsiPeriod] = useState(14);
  const [rsiOverbought, setRsiOverbought] = useState(70);
  const [rsiOversold, setRsiOversold] = useState(30);
  const [volumeMultiplier, setVolumeMultiplier] = useState(1.2);
  const [adxThreshold, setAdxThreshold] = useState(20);
  const [bollingerPeriod, setBollingerPeriod] = useState(20);
  const [bollingerStd, setBollingerStd] = useState(2.0);
  const [minTrendStrength, setMinTrendStrength] = useState(0.3);
  const [momentumThreshold, setMomentumThreshold] = useState(10);
  const [supportResistanceLookback, setSupportResistanceLookback] = useState(20);
  const [minVolumeSpike, setMinVolumeSpike] = useState(1.1);
  const [atrSlMultiplier, setAtrSlMultiplier] = useState(1.5);
  const [atrTpMultiplier, setAtrTpMultiplier] = useState(2.0);

  // SMA Crossover
  const [smaFastPeriod, setSmaFastPeriod] = useState(20);
  const [smaSlowPeriod, setSmaSlowPeriod] = useState(200);

  // MTF Momentum
  const [mtfRsiPeriod, setMtfRsiPeriod] = useState(14);
  const [mtfRsiEntryThreshold, setMtfRsiEntryThreshold] = useState(55);
  const [mtfMacdFast, setMtfMacdFast] = useState(12);
  const [mtfMacdSlow, setMtfMacdSlow] = useState(26);
  const [mtfMacdSignal, setMtfMacdSignal] = useState(9);
  const [mtfVolumeMultiplier, setMtfVolumeMultiplier] = useState(1.1);

  // FVG Scalping
  const [fvgKeyTimeStart, setFvgKeyTimeStart] = useState("09:30");
  const [fvgKeyTimeEnd, setFvgKeyTimeEnd] = useState("09:35");
  const [fvgKeyTimeframe, setFvgKeyTimeframe] = useState("5m");
  const [fvgAnalysisTimeframe, setFvgAnalysisTimeframe] = useState("1m");
  const [fvgRiskRewardRatio, setFvgRiskRewardRatio] = useState(3.0);
  const [fvgTickSize, setFvgTickSize] = useState(0.01);

  // ATH Guard
  const [athGuardEmaSlopeThreshold, setAthGuardEmaSlopeThreshold] = useState(0.15);
  const [athGuardPullbackTolerance, setAthGuardPullbackTolerance] = useState(0.15);
  const [athGuardVolumeMultiplier, setAthGuardVolumeMultiplier] = useState(1.8);
  const [athGuardStochOversold, setAthGuardStochOversold] = useState(25);
  const [athGuardStochOverbought, setAthGuardStochOverbought] = useState(75);
  const [athGuardAtrSlMultiplier, setAthGuardAtrSlMultiplier] = useState(1.0);
  const [athGuardAtrTp1Multiplier, setAthGuardAtrTp1Multiplier] = useState(2.0);
  const [athGuardAtrTp2Multiplier, setAthGuardAtrTp2Multiplier] = useState(0.2);
  const [athGuardAthSafetyDistance, setAthGuardAthSafetyDistance] = useState(70);
  const [athGuardRsiThreshold, setAthGuardRsiThreshold] = useState(70);

  // MSTG (Multi-Strategy)
  const [mstgWeightMomentum, setMstgWeightMomentum] = useState(0.25);
  const [mstgWeightTrend, setMstgWeightTrend] = useState(0.35);
  const [mstgWeightVolatility, setMstgWeightVolatility] = useState(0.20);
  const [mstgWeightRelative, setMstgWeightRelative] = useState(0.20);
  const [mstgLongThreshold, setMstgLongThreshold] = useState(30);
  const [mstgShortThreshold, setMstgShortThreshold] = useState(-30);
  const [mstgExitThreshold, setMstgExitThreshold] = useState(0);
  const [mstgExtremeThreshold, setMstgExtremeThreshold] = useState(60);

  // UI State
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Load strategy data when editing
  useEffect(() => {
    if (editStrategy && open) {
      loadStrategyData();
    } else if (!open) {
      resetForm();
    }
  }, [editStrategy, open]);

  const loadStrategyData = async () => {
    if (editStrategy) {
      // Basic Settings
      setName(editStrategy.name || "");
      setDescription(editStrategy.description || "");
      setSymbol(editStrategy.symbol || "BTCUSDT");
      setTimeframe(editStrategy.timeframe || "1h");
      setStrategyType(editStrategy.strategy_type || "sma_crossover");
      setStatus(editStrategy.status || "active");
      setInitialCapital(editStrategy.initial_capital || 1000);
      setPositionSizePercent(editStrategy.position_size_percent || 5);
      setBenchmarkSymbol(editStrategy.benchmark_symbol || "BTCUSDT");

      // Risk Management
      setStopLossPercent(editStrategy.stop_loss_percent || 1);
      setTakeProfitPercent(editStrategy.take_profit_percent || 2);
      setTrailingStopPercent(editStrategy.trailing_stop_percent || 0.5);
      setMaxPositionTime(editStrategy.max_position_time || 240);
      setMinProfitPercent(editStrategy.min_profit_percent || 0.2);

      // General Filters
      setRsiPeriod(editStrategy.rsi_period || 14);
      setRsiOverbought(editStrategy.rsi_overbought || 70);
      setRsiOversold(editStrategy.rsi_oversold || 30);
      setVolumeMultiplier(editStrategy.volume_multiplier || 1.2);
      setAdxThreshold(editStrategy.adx_threshold || 20);
      setBollingerPeriod(editStrategy.bollinger_period || 20);
      setBollingerStd(editStrategy.bollinger_std || 2.0);
      setMinTrendStrength(editStrategy.min_trend_strength || 0.3);
      setMomentumThreshold(editStrategy.momentum_threshold || 10);
      setSupportResistanceLookback(editStrategy.support_resistance_lookback || 20);
      setMinVolumeSpike(editStrategy.min_volume_spike || 1.1);
      setAtrSlMultiplier(editStrategy.atr_sl_multiplier || 1.5);
      setAtrTpMultiplier(editStrategy.atr_tp_multiplier || 2.0);

      // SMA Crossover
      setSmaFastPeriod(editStrategy.sma_fast_period || 20);
      setSmaSlowPeriod(editStrategy.sma_slow_period || 200);

      // MTF Momentum
      setMtfRsiPeriod(editStrategy.mtf_rsi_period || 14);
      setMtfRsiEntryThreshold(editStrategy.mtf_rsi_entry_threshold || 55);
      setMtfMacdFast(editStrategy.mtf_macd_fast || 12);
      setMtfMacdSlow(editStrategy.mtf_macd_slow || 26);
      setMtfMacdSignal(editStrategy.mtf_macd_signal || 9);
      setMtfVolumeMultiplier(editStrategy.mtf_volume_multiplier || 1.1);

      // FVG Scalping
      const fvgTime = editStrategy.fvg_key_candle_time || "09:30-09:35";
      const [start, end] = fvgTime.split('-');
      setFvgKeyTimeStart(start || "09:30");
      setFvgKeyTimeEnd(end || "09:35");
      setFvgKeyTimeframe(editStrategy.fvg_key_timeframe || "5m");
      setFvgAnalysisTimeframe(editStrategy.fvg_analysis_timeframe || "1m");
      setFvgRiskRewardRatio(editStrategy.fvg_risk_reward_ratio || 3.0);
      setFvgTickSize(editStrategy.fvg_tick_size || 0.01);

      // ATH Guard
      setAthGuardEmaSlopeThreshold(editStrategy.ath_guard_ema_slope_threshold || 0.15);
      setAthGuardPullbackTolerance(editStrategy.ath_guard_pullback_tolerance || 0.15);
      setAthGuardVolumeMultiplier(editStrategy.ath_guard_volume_multiplier || 1.8);
      setAthGuardStochOversold(editStrategy.ath_guard_stoch_oversold || 25);
      setAthGuardStochOverbought(editStrategy.ath_guard_stoch_overbought || 75);
      setAthGuardAtrSlMultiplier(editStrategy.ath_guard_atr_sl_multiplier || 1.0);
      setAthGuardAtrTp1Multiplier(editStrategy.ath_guard_atr_tp1_multiplier || 2.0);
      setAthGuardAtrTp2Multiplier(editStrategy.ath_guard_atr_tp2_multiplier || 0.2);
      setAthGuardAthSafetyDistance(editStrategy.ath_guard_ath_safety_distance || 70);
      setAthGuardRsiThreshold(editStrategy.ath_guard_rsi_threshold || 70);

      // MSTG
      setMstgWeightMomentum(editStrategy.mstg_weight_momentum || 0.25);
      setMstgWeightTrend(editStrategy.mstg_weight_trend || 0.35);
      setMstgWeightVolatility(editStrategy.mstg_weight_volatility || 0.20);
      setMstgWeightRelative(editStrategy.mstg_weight_relative || 0.20);
      setMstgLongThreshold(editStrategy.mstg_long_threshold || 30);
      setMstgShortThreshold(editStrategy.mstg_short_threshold || -30);
      setMstgExitThreshold(editStrategy.mstg_exit_threshold || 0);
      setMstgExtremeThreshold(editStrategy.mstg_extreme_threshold || 60);

      setHasUnsavedChanges(false);
    }
  };

  const resetForm = () => {
    // Reset all state to defaults
    setName("");
    setDescription("");
    setSymbol("BTCUSDT");
    setTimeframe("1h");
    setStrategyType("sma_crossover");
    setStatus("active");
    setInitialCapital(1000);
    setPositionSizePercent(5);
    setBenchmarkSymbol("BTCUSDT");
    setStopLossPercent(1);
    setTakeProfitPercent(2);
    setTrailingStopPercent(0.5);
    setMaxPositionTime(240);
    setMinProfitPercent(0.2);
    setRsiPeriod(14);
    setRsiOverbought(70);
    setRsiOversold(30);
    setVolumeMultiplier(1.2);
    setAdxThreshold(20);
    setBollingerPeriod(20);
    setBollingerStd(2.0);
    setMinTrendStrength(0.3);
    setMomentumThreshold(10);
    setSupportResistanceLookback(20);
    setMinVolumeSpike(1.1);
    setAtrSlMultiplier(1.5);
    setAtrTpMultiplier(2.0);
    setSmaFastPeriod(20);
    setSmaSlowPeriod(200);
    setMtfRsiPeriod(14);
    setMtfRsiEntryThreshold(55);
    setMtfMacdFast(12);
    setMtfMacdSlow(26);
    setMtfMacdSignal(9);
    setMtfVolumeMultiplier(1.1);
    setFvgKeyTimeStart("09:30");
    setFvgKeyTimeEnd("09:35");
    setFvgKeyTimeframe("5m");
    setFvgAnalysisTimeframe("1m");
    setFvgRiskRewardRatio(3.0);
    setFvgTickSize(0.01);
    setAthGuardEmaSlopeThreshold(0.15);
    setAthGuardPullbackTolerance(0.15);
    setAthGuardVolumeMultiplier(1.8);
    setAthGuardStochOversold(25);
    setAthGuardStochOverbought(75);
    setAthGuardAtrSlMultiplier(1.0);
    setAthGuardAtrTp1Multiplier(2.0);
    setAthGuardAtrTp2Multiplier(0.2);
    setAthGuardAthSafetyDistance(70);
    setAthGuardRsiThreshold(70);
    setMstgWeightMomentum(0.25);
    setMstgWeightTrend(0.35);
    setMstgWeightVolatility(0.20);
    setMstgWeightRelative(0.20);
    setMstgLongThreshold(30);
    setMstgShortThreshold(-30);
    setMstgExitThreshold(0);
    setMstgExtremeThreshold(60);
    setValidationErrors({});
    setHasUnsavedChanges(false);
  };

  const validateField = (field: string, value: any): string => {
    switch (field) {
      case 'name':
        return !value || value.trim() === '' ? 'Strategy name is required' : '';
      case 'symbol':
        return !value || value.trim() === '' ? 'Symbol is required' : '';
      case 'timeframe':
        return !value || value.trim() === '' ? 'Timeframe is required' : '';
      case 'strategyType':
        return !value || value.trim() === '' ? 'Strategy type is required' : '';
      case 'initialCapital':
        return !value || value <= 0 ? 'Initial capital must be greater than 0' : '';
      case 'positionSizePercent':
        return value < 0 || value > 100 ? 'Position size must be between 0 and 100' : '';
      case 'stopLossPercent':
        return value < 0 || value > 100 ? 'Stop loss must be between 0 and 100' : '';
      case 'takeProfitPercent':
        return value < 0 || value > 100 ? 'Take profit must be between 0 and 100' : '';
      case 'trailingStopPercent':
        return value < 0 || value > 100 ? 'Trailing stop must be between 0 and 100' : '';
      case 'rsiOverbought':
      case 'rsiOversold':
      case 'mtfRsiEntryThreshold':
      case 'athGuardRsiThreshold':
        return value < 0 || value > 100 ? 'RSI values must be between 0 and 100' : '';
      case 'adxThreshold':
        return value < 0 || value > 100 ? 'ADX threshold must be between 0 and 100' : '';
      case 'athGuardStochOversold':
      case 'athGuardStochOverbought':
        return value < 0 || value > 100 ? 'Stochastic values must be between 0 and 100' : '';
      case 'rsiPeriod':
      case 'mtfRsiPeriod':
      case 'bollingerPeriod':
      case 'smaFastPeriod':
      case 'smaSlowPeriod':
      case 'mtfMacdFast':
      case 'mtfMacdSlow':
      case 'mtfMacdSignal':
        return value <= 0 ? 'Period must be greater than 0' : '';
      case 'volumeMultiplier':
      case 'mtfVolumeMultiplier':
      case 'athGuardVolumeMultiplier':
      case 'minVolumeSpike':
        return value <= 0 ? 'Volume multiplier must be greater than 0' : '';
      case 'fvgRiskRewardRatio':
        return value <= 0 ? 'Risk/reward ratio must be greater than 0' : '';
      case 'fvgTickSize':
        return value <= 0 ? 'Tick size must be greater than 0' : '';
      case 'fvgKeyTimeStart':
      case 'fvgKeyTimeEnd':
        return !/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(value) ? 'Time must be in HH:MM format' : '';
      default:
        return '';
    }
  };

  const validateAllFields = (): boolean => {
    const errors: ValidationErrors = {};
    
    // Basic Settings
    const basicFields = {
      name, symbol, timeframe, strategyType, initialCapital, positionSizePercent
    };
    
    Object.entries(basicFields).forEach(([field, value]) => {
      const error = validateField(field, value);
      if (error) errors[field] = error;
    });

    // Risk Management
    const riskFields = {
      stopLossPercent, takeProfitPercent, trailingStopPercent
    };
    
    Object.entries(riskFields).forEach(([field, value]) => {
      const error = validateField(field, value);
      if (error) errors[field] = error;
    });

    // General Filters
    const generalFields = {
      rsiPeriod, rsiOverbought, rsiOversold, volumeMultiplier, adxThreshold,
      bollingerPeriod, bollingerStd, minTrendStrength, momentumThreshold,
      supportResistanceLookback, minVolumeSpike, atrSlMultiplier, atrTpMultiplier
    };
    
    Object.entries(generalFields).forEach(([field, value]) => {
      const error = validateField(field, value);
      if (error) errors[field] = error;
    });

    // Strategy-specific fields based on type
    if (strategyType === 'sma_crossover' || strategyType === 'sma_20_200_rsi') {
      const smaFields = { smaFastPeriod, smaSlowPeriod };
      Object.entries(smaFields).forEach(([field, value]) => {
        const error = validateField(field, value);
        if (error) errors[field] = error;
      });
    }

    if (strategyType === 'mtf_momentum') {
      const mtfFields = {
        mtfRsiPeriod, mtfRsiEntryThreshold, mtfMacdFast, mtfMacdSlow, mtfMacdSignal, mtfVolumeMultiplier
      };
      Object.entries(mtfFields).forEach(([field, value]) => {
        const error = validateField(field, value);
        if (error) errors[field] = error;
      });
    }

    if (strategyType === 'fvg_scalping') {
      const fvgFields = {
        fvgKeyTimeStart, fvgKeyTimeEnd, fvgRiskRewardRatio, fvgTickSize
      };
      Object.entries(fvgFields).forEach(([field, value]) => {
        const error = validateField(field, value);
        if (error) errors[field] = error;
      });
    }

    if (strategyType === 'ath_guard_scalping') {
      const athFields = {
        athGuardEmaSlopeThreshold, athGuardPullbackTolerance, athGuardVolumeMultiplier,
        athGuardStochOversold, athGuardStochOverbought, athGuardAtrSlMultiplier,
        athGuardAtrTp1Multiplier, athGuardAtrTp2Multiplier, athGuardAthSafetyDistance,
        athGuardRsiThreshold
      };
      Object.entries(athFields).forEach(([field, value]) => {
        const error = validateField(field, value);
        if (error) errors[field] = error;
      });
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleFieldChange = (field: string, value: any, setter: (value: any) => void) => {
    setter(value);
    setHasUnsavedChanges(true);
    
    // Clear error for this field when user starts typing
    if (validationErrors[field]) {
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const saveStrategy = async () => {
    if (!validateAllFields()) {
      toast({
        title: "Validation Error",
        description: "Please fix all validation errors before saving",
        variant: "destructive"
      });
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      const strategyData = {
        // Basic Settings
        name: name.trim(),
        description: description.trim() || null,
        symbol: symbol.trim(),
        timeframe: timeframe.trim(),
        strategy_type: strategyType,
        status: status,
        initial_capital: initialCapital,
        position_size_percent: positionSizePercent,
        benchmark_symbol: benchmarkSymbol.trim() || null,

        // Risk Management
        stop_loss_percent: stopLossPercent,
        take_profit_percent: takeProfitPercent,
        trailing_stop_percent: trailingStopPercent,
        max_position_time: maxPositionTime,
        min_profit_percent: minProfitPercent,

        // General Filters
        rsi_period: rsiPeriod,
        rsi_overbought: rsiOverbought,
        rsi_oversold: rsiOversold,
        volume_multiplier: volumeMultiplier,
        adx_threshold: adxThreshold,
        bollinger_period: bollingerPeriod,
        bollinger_std: bollingerStd,
        min_trend_strength: minTrendStrength,
        momentum_threshold: momentumThreshold,
        support_resistance_lookback: supportResistanceLookback,
        min_volume_spike: minVolumeSpike,
        atr_sl_multiplier: atrSlMultiplier,
        atr_tp_multiplier: atrTpMultiplier,

        // SMA Crossover
        sma_fast_period: smaFastPeriod,
        sma_slow_period: smaSlowPeriod,

        // MTF Momentum
        mtf_rsi_period: mtfRsiPeriod,
        mtf_rsi_entry_threshold: mtfRsiEntryThreshold,
        mtf_macd_fast: mtfMacdFast,
        mtf_macd_slow: mtfMacdSlow,
        mtf_macd_signal: mtfMacdSignal,
        mtf_volume_multiplier: mtfVolumeMultiplier,

        // FVG Scalping
        fvg_key_candle_time: `${fvgKeyTimeStart}-${fvgKeyTimeEnd}`,
        fvg_key_timeframe: fvgKeyTimeframe,
        fvg_analysis_timeframe: fvgAnalysisTimeframe,
        fvg_risk_reward_ratio: fvgRiskRewardRatio,
        fvg_tick_size: fvgTickSize,

        // ATH Guard
        ath_guard_ema_slope_threshold: athGuardEmaSlopeThreshold,
        ath_guard_pullback_tolerance: athGuardPullbackTolerance,
        ath_guard_volume_multiplier: athGuardVolumeMultiplier,
        ath_guard_stoch_oversold: athGuardStochOversold,
        ath_guard_stoch_overbought: athGuardStochOverbought,
        ath_guard_atr_sl_multiplier: athGuardAtrSlMultiplier,
        ath_guard_atr_tp1_multiplier: athGuardAtrTp1Multiplier,
        ath_guard_atr_tp2_multiplier: athGuardAtrTp2Multiplier,
        ath_guard_ath_safety_distance: athGuardAthSafetyDistance,
        ath_guard_rsi_threshold: athGuardRsiThreshold,

        // MSTG
        mstg_weight_momentum: mstgWeightMomentum,
        mstg_weight_trend: mstgWeightTrend,
        mstg_weight_volatility: mstgWeightVolatility,
        mstg_weight_relative: mstgWeightRelative,
        mstg_long_threshold: mstgLongThreshold,
        mstg_short_threshold: mstgShortThreshold,
        mstg_exit_threshold: mstgExitThreshold,
        mstg_extreme_threshold: mstgExtremeThreshold,

        updated_at: new Date().toISOString()
      };

      if (editStrategy) {
        // Update existing strategy
        const { error } = await supabase
          .from('strategies')
          .update(strategyData)
          .eq('id', editStrategy.id);

        if (error) throw error;

        await logStrategyEdit(editStrategy.id, editStrategy.name, strategyData);
        
        toast({
          title: "Success",
          description: "Strategy updated successfully"
        });
      } else {
        // Create new strategy
        const { error } = await supabase
          .from('strategies')
          .insert({
            ...strategyData,
            user_id: user.id,
            created_at: new Date().toISOString()
          });

        if (error) throw error;

        await logStrategyCreate(strategyData.name, strategyData.strategy_type);
        
        toast({
          title: "Success",
          description: "Strategy created successfully"
        });
      }

      setHasUnsavedChanges(false);
      onSuccess();
      
    } catch (error: any) {
      console.error('Error saving strategy:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to save strategy",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    if (hasUnsavedChanges) {
      if (confirm("You have unsaved changes. Are you sure you want to close?")) {
        onOpenChange(false);
      }
    } else {
      onOpenChange(false);
    }
  };

  const renderField = (
    label: string,
    field: string,
    value: any,
    setter: (value: any) => void,
    type: 'text' | 'number' | 'textarea' | 'select' | 'time' = 'text',
    options?: { value: string; label: string }[],
    required: boolean = false,
    min?: number,
    max?: number,
    step?: number
  ) => {
    const error = validationErrors[field];
    
    return (
      <div className="space-y-2">
        <Label htmlFor={field} className="flex items-center gap-2">
          {label}
          {required && <span className="text-red-500">*</span>}
        </Label>
        
        {type === 'textarea' ? (
          <Textarea
            id={field}
            value={value}
            onChange={(e) => handleFieldChange(field, e.target.value, setter)}
            className={error ? "border-red-500" : ""}
            rows={3}
          />
        ) : type === 'select' ? (
          <Select value={value} onValueChange={(val) => handleFieldChange(field, val, setter)}>
            <SelectTrigger className={error ? "border-red-500" : ""}>
              <SelectValue placeholder={`Select ${label.toLowerCase()}`} />
            </SelectTrigger>
            <SelectContent>
              {options?.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : type === 'time' ? (
          <Input
            id={field}
            type="time"
            value={value}
            onChange={(e) => handleFieldChange(field, e.target.value, setter)}
            className={error ? "border-red-500" : ""}
          />
        ) : (
          <Input
            id={field}
            type={type}
            value={value}
            onChange={(e) => handleFieldChange(field, type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value, setter)}
            className={error ? "border-red-500" : ""}
            min={min}
            max={max}
            step={step}
          />
        )}
        
        {error && (
          <p className="text-sm text-red-500 flex items-center gap-1">
            <XCircle className="h-3 w-3" />
            {error}
          </p>
        )}
      </div>
    );
  };

  const hasValidationErrors = Object.keys(validationErrors).length > 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            {editStrategy ? "Edit Trading Strategy" : "Create Trading Strategy"}
          </DialogTitle>
          <DialogDescription>
            {editStrategy ? "Modify your strategy parameters and filters" : "Create a new coded trading strategy with pre-configured logic"}
          </DialogDescription>
        </DialogHeader>

        {hasValidationErrors && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Please fix the validation errors below before saving the strategy.
            </AlertDescription>
          </Alert>
        )}

        <div className="flex-1 overflow-y-auto">
          <Accordion type="multiple" defaultValue={["basic", "risk"]} className="space-y-4">
            
            {/* Basic Settings */}
            <AccordionItem value="basic">
              <AccordionTrigger className="text-left">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span className="font-semibold">Basic Settings</span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <Card>
                  <CardContent className="pt-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {renderField("Strategy Name", "name", name, setName, "text", undefined, true)}
                      {renderField("Symbol", "symbol", symbol, setSymbol, "text", undefined, true)}
                      {renderField("Timeframe", "timeframe", timeframe, setTimeframe, "select", [
                        { value: "1m", label: "1 Minute" },
                        { value: "5m", label: "5 Minutes" },
                        { value: "15m", label: "15 Minutes" },
                        { value: "1h", label: "1 Hour" },
                        { value: "4h", label: "4 Hours" },
                        { value: "1d", label: "1 Day" }
                      ], true)}
                      {renderField("Strategy Type", "strategyType", strategyType, setStrategyType, "select", [
                        { value: "sma_crossover", label: "SMA 20/200 Crossover" },
                        { value: "sma_20_200_rsi", label: "SMA 20/200 RSI" },
                        { value: "mtf_momentum", label: "MTF Momentum" },
                        { value: "fvg_scalping", label: "FVG Scalping" },
                        { value: "ath_guard_scalping", label: "ATH Guard Scalping" },
                        { value: "4h_reentry", label: "4h Reentry" }
                      ], true)}
                      {renderField("Status", "status", status, setStatus, "select", [
                        { value: "active", label: "Active" },
                        { value: "paused", label: "Paused" },
                        { value: "draft", label: "Draft" }
                      ])}
                      {renderField("Initial Capital", "initialCapital", initialCapital, setInitialCapital, "number", undefined, true, 1)}
                      {renderField("Position Size %", "positionSizePercent", positionSizePercent, setPositionSizePercent, "number", undefined, true, 0, 100)}
                      {renderField("Benchmark Symbol", "benchmarkSymbol", benchmarkSymbol, setBenchmarkSymbol, "text")}
                    </div>
                    <div className="mt-4">
                      {renderField("Description", "description", description, setDescription, "textarea")}
                    </div>
                  </CardContent>
                </Card>
              </AccordionContent>
            </AccordionItem>

            {/* Risk Management */}
            <AccordionItem value="risk">
              <AccordionTrigger className="text-left">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-orange-500" />
                  <span className="font-semibold">Risk Management</span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <Card>
                  <CardContent className="pt-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {renderField("Stop Loss %", "stopLossPercent", stopLossPercent, setStopLossPercent, "number", undefined, true, 0, 100, 0.1)}
                      {renderField("Take Profit %", "takeProfitPercent", takeProfitPercent, setTakeProfitPercent, "number", undefined, true, 0, 100, 0.1)}
                      {renderField("Trailing Stop %", "trailingStopPercent", trailingStopPercent, setTrailingStopPercent, "number", undefined, false, 0, 100, 0.1)}
                      {renderField("Max Position Time (min)", "maxPositionTime", maxPositionTime, setMaxPositionTime, "number", undefined, false, 1)}
                      {renderField("Min Profit %", "minProfitPercent", minProfitPercent, setMinProfitPercent, "number", undefined, false, 0, 100, 0.1)}
                    </div>
                  </CardContent>
                </Card>
              </AccordionContent>
            </AccordionItem>

            {/* General Filters */}
            <AccordionItem value="general">
              <AccordionTrigger className="text-left">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">General Filters</span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <Card>
                  <CardContent className="pt-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {renderField("RSI Period", "rsiPeriod", rsiPeriod, setRsiPeriod, "number", undefined, false, 1)}
                      {renderField("RSI Overbought", "rsiOverbought", rsiOverbought, setRsiOverbought, "number", undefined, false, 0, 100)}
                      {renderField("RSI Oversold", "rsiOversold", rsiOversold, setRsiOversold, "number", undefined, false, 0, 100)}
                      {renderField("Volume Multiplier", "volumeMultiplier", volumeMultiplier, setVolumeMultiplier, "number", undefined, false, 0.1, 10, 0.1)}
                      {renderField("ADX Threshold", "adxThreshold", adxThreshold, setAdxThreshold, "number", undefined, false, 0, 100)}
                      {renderField("Bollinger Period", "bollingerPeriod", bollingerPeriod, setBollingerPeriod, "number", undefined, false, 1)}
                      {renderField("Bollinger Std Dev", "bollingerStd", bollingerStd, setBollingerStd, "number", undefined, false, 0.1, 5, 0.1)}
                      {renderField("Min Trend Strength", "minTrendStrength", minTrendStrength, setMinTrendStrength, "number", undefined, false, 0, 1, 0.1)}
                      {renderField("Momentum Threshold", "momentumThreshold", momentumThreshold, setMomentumThreshold, "number", undefined, false, 0)}
                      {renderField("S/R Lookback", "supportResistanceLookback", supportResistanceLookback, setSupportResistanceLookback, "number", undefined, false, 1)}
                      {renderField("Min Volume Spike", "minVolumeSpike", minVolumeSpike, setMinVolumeSpike, "number", undefined, false, 0.1, 10, 0.1)}
                      {renderField("ATR SL Multiplier", "atrSlMultiplier", atrSlMultiplier, setAtrSlMultiplier, "number", undefined, false, 0.1, 10, 0.1)}
                      {renderField("ATR TP Multiplier", "atrTpMultiplier", atrTpMultiplier, setAtrTpMultiplier, "number", undefined, false, 0.1, 10, 0.1)}
                    </div>
                  </CardContent>
                </Card>
              </AccordionContent>
            </AccordionItem>

            {/* SMA Crossover */}
            {(strategyType === 'sma_crossover' || strategyType === 'sma_20_200_rsi') && (
              <AccordionItem value="sma">
                <AccordionTrigger className="text-left">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">SMA Crossover Settings</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {renderField("SMA Fast Period", "smaFastPeriod", smaFastPeriod, setSmaFastPeriod, "number", undefined, true, 1)}
                        {renderField("SMA Slow Period", "smaSlowPeriod", smaSlowPeriod, setSmaSlowPeriod, "number", undefined, true, 1)}
                      </div>
                    </CardContent>
                  </Card>
                </AccordionContent>
              </AccordionItem>
            )}

            {/* MTF Momentum */}
            {strategyType === 'mtf_momentum' && (
              <AccordionItem value="mtf">
                <AccordionTrigger className="text-left">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">MTF Momentum Settings</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {renderField("MTF RSI Period", "mtfRsiPeriod", mtfRsiPeriod, setMtfRsiPeriod, "number", undefined, true, 1)}
                        {renderField("MTF RSI Entry Threshold", "mtfRsiEntryThreshold", mtfRsiEntryThreshold, setMtfRsiEntryThreshold, "number", undefined, true, 0, 100)}
                        {renderField("MTF MACD Fast", "mtfMacdFast", mtfMacdFast, setMtfMacdFast, "number", undefined, true, 1)}
                        {renderField("MTF MACD Slow", "mtfMacdSlow", mtfMacdSlow, setMtfMacdSlow, "number", undefined, true, 1)}
                        {renderField("MTF MACD Signal", "mtfMacdSignal", mtfMacdSignal, setMtfMacdSignal, "number", undefined, true, 1)}
                        {renderField("MTF Volume Multiplier", "mtfVolumeMultiplier", mtfVolumeMultiplier, setMtfVolumeMultiplier, "number", undefined, true, 0.1, 10, 0.1)}
                      </div>
                    </CardContent>
                  </Card>
                </AccordionContent>
              </AccordionItem>
            )}

            {/* FVG Scalping */}
            {strategyType === 'fvg_scalping' && (
              <AccordionItem value="fvg">
                <AccordionTrigger className="text-left">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">FVG Scalping Settings</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {renderField("FVG Key Time Start", "fvgKeyTimeStart", fvgKeyTimeStart, setFvgKeyTimeStart, "time", undefined, true)}
                        {renderField("FVG Key Time End", "fvgKeyTimeEnd", fvgKeyTimeEnd, setFvgKeyTimeEnd, "time", undefined, true)}
                        {renderField("FVG Key Timeframe", "fvgKeyTimeframe", fvgKeyTimeframe, setFvgKeyTimeframe, "select", [
                          { value: "1m", label: "1 Minute" },
                          { value: "5m", label: "5 Minutes" },
                          { value: "15m", label: "15 Minutes" }
                        ])}
                        {renderField("FVG Analysis Timeframe", "fvgAnalysisTimeframe", fvgAnalysisTimeframe, setFvgAnalysisTimeframe, "select", [
                          { value: "1m", label: "1 Minute" },
                          { value: "5m", label: "5 Minutes" }
                        ])}
                        {renderField("FVG Risk/Reward Ratio", "fvgRiskRewardRatio", fvgRiskRewardRatio, setFvgRiskRewardRatio, "number", undefined, true, 0.1, 10, 0.1)}
                        {renderField("FVG Tick Size", "fvgTickSize", fvgTickSize, setFvgTickSize, "number", undefined, true, 0.001, 1, 0.001)}
                      </div>
                    </CardContent>
                  </Card>
                </AccordionContent>
              </AccordionItem>
            )}

            {/* ATH Guard */}
            {strategyType === 'ath_guard_scalping' && (
              <AccordionItem value="ath">
                <AccordionTrigger className="text-left">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">ATH Guard Settings</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {renderField("EMA Slope Threshold", "athGuardEmaSlopeThreshold", athGuardEmaSlopeThreshold, setAthGuardEmaSlopeThreshold, "number", undefined, true, 0, 1, 0.01)}
                        {renderField("Pullback Tolerance", "athGuardPullbackTolerance", athGuardPullbackTolerance, setAthGuardPullbackTolerance, "number", undefined, true, 0, 1, 0.01)}
                        {renderField("Volume Multiplier", "athGuardVolumeMultiplier", athGuardVolumeMultiplier, setAthGuardVolumeMultiplier, "number", undefined, true, 0.1, 10, 0.1)}
                        {renderField("Stoch Oversold", "athGuardStochOversold", athGuardStochOversold, setAthGuardStochOversold, "number", undefined, true, 0, 100)}
                        {renderField("Stoch Overbought", "athGuardStochOverbought", athGuardStochOverbought, setAthGuardStochOverbought, "number", undefined, true, 0, 100)}
                        {renderField("ATR SL Multiplier", "athGuardAtrSlMultiplier", athGuardAtrSlMultiplier, setAthGuardAtrSlMultiplier, "number", undefined, true, 0.1, 10, 0.1)}
                        {renderField("ATR TP1 Multiplier", "athGuardAtrTp1Multiplier", athGuardAtrTp1Multiplier, setAthGuardAtrTp1Multiplier, "number", undefined, true, 0.1, 10, 0.1)}
                        {renderField("ATR TP2 Multiplier", "athGuardAtrTp2Multiplier", athGuardAtrTp2Multiplier, setAthGuardAtrTp2Multiplier, "number", undefined, true, 0.1, 10, 0.1)}
                        {renderField("ATH Safety Distance", "athGuardAthSafetyDistance", athGuardAthSafetyDistance, setAthGuardAthSafetyDistance, "number", undefined, true, 0, 100)}
                        {renderField("RSI Threshold", "athGuardRsiThreshold", athGuardRsiThreshold, setAthGuardRsiThreshold, "number", undefined, true, 0, 100)}
                      </div>
                    </CardContent>
                  </Card>
                </AccordionContent>
              </AccordionItem>
            )}

            {/* MSTG */}
            <AccordionItem value="mstg">
              <AccordionTrigger className="text-left">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">Multi-Strategy (MSTG) Settings</span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <Card>
                  <CardContent className="pt-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      {renderField("Weight Momentum", "mstgWeightMomentum", mstgWeightMomentum, setMstgWeightMomentum, "number", undefined, false, 0, 1, 0.01)}
                      {renderField("Weight Trend", "mstgWeightTrend", mstgWeightTrend, setMstgWeightTrend, "number", undefined, false, 0, 1, 0.01)}
                      {renderField("Weight Volatility", "mstgWeightVolatility", mstgWeightVolatility, setMstgWeightVolatility, "number", undefined, false, 0, 1, 0.01)}
                      {renderField("Weight Relative", "mstgWeightRelative", mstgWeightRelative, setMstgWeightRelative, "number", undefined, false, 0, 1, 0.01)}
                      {renderField("Long Threshold", "mstgLongThreshold", mstgLongThreshold, setMstgLongThreshold, "number", undefined, false, -100, 100)}
                      {renderField("Short Threshold", "mstgShortThreshold", mstgShortThreshold, setMstgShortThreshold, "number", undefined, false, -100, 100)}
                      {renderField("Exit Threshold", "mstgExitThreshold", mstgExitThreshold, setMstgExitThreshold, "number", undefined, false, -100, 100)}
                      {renderField("Extreme Threshold", "mstgExtremeThreshold", mstgExtremeThreshold, setMstgExtremeThreshold, "number", undefined, false, 0, 100)}
                    </div>
                  </CardContent>
                </Card>
              </AccordionContent>
            </AccordionItem>

          </Accordion>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button variant="outline" onClick={handleClose} disabled={saving}>
            Cancel
          </Button>
          <Button 
            onClick={saveStrategy} 
            disabled={saving || hasValidationErrors}
            className="min-w-[100px]"
          >
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                Saving...
              </>
            ) : (
              editStrategy ? "Update Strategy" : "Create Strategy"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};