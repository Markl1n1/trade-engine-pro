import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type IndicatorCategory = 'moving_average' | 'oscillator' | 'volume' | 'trend' | 'volatility';

// Only show indicators that are currently supported by the backtest function
// Map display names to database enum values
const INDICATOR_DB_MAP: Record<string, string> = {
  'SMA': 'sma',
  'EMA': 'ema',
  'RSI': 'rsi',
  'MACD': 'macd',
  'ATR': 'atr',
  'ADX': 'adx',
  'STOCHASTIC': 'stochastic',
  'BOLLINGER_BANDS': 'bollinger_bands',
  'WMA': 'wma',
  'DEMA': 'dema',
  'TEMA': 'tema',
  'HULL_MA': 'hull_ma',
  'VWMA': 'vwma',
  'STOCH_RSI': 'stoch_rsi',
  'MOMENTUM': 'momentum',
  'CCI': 'cci',
  'WPR': 'wpr',
  'MFI': 'mfi',
  'ROC': 'roc',
  'OBV': 'obv',
  'AD_LINE': 'ad_line',
  'CMF': 'cmf',
  'VWAP': 'vwap',
  'VOLUME': 'volume',
  'PSAR': 'psar',
  'SUPERTREND': 'supertrend',
  'KDJ_J': 'kdj_j',
  'TD_SEQUENTIAL': 'td_sequential',
  'ANCHORED_VWAP': 'anchored_vwap',
  'BB_WIDTH': 'bb_width',
  'PERCENT_B': 'percent_b',
  'EMA_CROSSOVER': 'ema_crossover',
  'ICHIMOKU_TENKAN': 'ichimoku_tenkan',
  'ICHIMOKU_KIJUN': 'ichimoku_kijun',
  'ICHIMOKU_SENKOU_A': 'ichimoku_senkou_a',
  'ICHIMOKU_SENKOU_B': 'ichimoku_senkou_b',
  'ICHIMOKU_CHIKOU': 'ichimoku_chikou',
  'PRICE': 'price',
  'OPEN': 'open',
  'HIGH': 'high',
  'LOW': 'low'
};

export const INDICATOR_CATEGORIES: Record<IndicatorCategory, { label: string; indicators: string[] }> = {
  moving_average: {
    label: 'Moving Averages',
    indicators: ['SMA', 'EMA', 'WMA', 'DEMA', 'TEMA', 'HULL_MA', 'VWMA']
  },
  oscillator: {
    label: 'Oscillators',
    indicators: ['RSI', 'STOCHASTIC', 'STOCH_RSI', 'MOMENTUM', 'CCI', 'WPR', 'MFI', 'ROC', 'KDJ_J']
  },
  volume: {
    label: 'Volume Indicators',
    indicators: ['OBV', 'AD_LINE', 'CMF', 'VWAP', 'ANCHORED_VWAP', 'VOLUME']
  },
  trend: {
    label: 'Trend Indicators',
    indicators: ['MACD', 'ADX', 'SUPERTREND', 'PSAR', 'ICHIMOKU_TENKAN', 'ICHIMOKU_KIJUN', 'EMA_CROSSOVER', 'PRICE', 'OPEN', 'HIGH', 'LOW']
  },
  volatility: {
    label: 'Volatility Indicators',
    indicators: ['ATR', 'BOLLINGER_BANDS', 'BB_WIDTH', 'PERCENT_B', 'TD_SEQUENTIAL']
  }
};

// Helper to convert display name to DB value
export const getDbIndicatorName = (displayName: string): string => {
  return INDICATOR_DB_MAP[displayName] || displayName;
};

export const INDICATOR_PARAMS: Record<string, { periods?: boolean; deviation?: boolean; smoothing?: boolean; multiplier?: boolean; acceleration?: boolean }> = {
  SMA: { periods: true },
  EMA: { periods: true },
  WMA: { periods: true },
  RSI: { periods: true },
  MACD: { periods: true },
  BOLLINGER_BANDS: { periods: true, deviation: true },
  BB_UPPER: { periods: true, deviation: true },
  BB_MIDDLE: { periods: true },
  BB_LOWER: { periods: true, deviation: true },
  BB_WIDTH: { periods: true, deviation: true },
  PERCENT_B: { periods: true, deviation: true },
  ATR: { periods: true },
  STOCHASTIC: { periods: true, smoothing: true },
  ADX: { periods: true },
  CCI: { periods: true },
  MFI: { periods: true },
  PSAR: { acceleration: true },
  SUPERTREND: { periods: true, multiplier: true },
  KDJ_J: { periods: true, smoothing: true },
  TD_SEQUENTIAL: {},
  KELTNER_UPPER: { periods: true, multiplier: true },
  KELTNER_LOWER: { periods: true, multiplier: true },
  ICHIMOKU_TENKAN: { periods: true },
  ICHIMOKU_KIJUN: { periods: true },
  ICHIMOKU_SENKOU_A: {},
  ICHIMOKU_SENKOU_B: { periods: true },
  ICHIMOKU_CHIKOU: {},
  EMA_CROSSOVER: { periods: true },
  DEMA: { periods: true },
  TEMA: { periods: true },
  HULL_MA: { periods: true },
  KAMA: { periods: true },
  STOCH_RSI: { periods: true },
  TSI: { periods: true },
  ULTIMATE_OSC: { periods: true },
  VWMA: { periods: true },
  VWAP: {},
  ANCHORED_VWAP: {},
  OBV: {},
  VOLUME: {},
  AD_LINE: {},
  CMF: { periods: true },
  MOMENTUM: { periods: true },
  ROC: { periods: true },
  PRICE: {},
  OPEN: {},
  HIGH: {},
  LOW: {},
};

interface IndicatorSelectorProps {
  value: string;
  onChange: (value: string) => void;
  period?: number;
  onPeriodChange?: (value: number) => void;
  deviation?: number;
  onDeviationChange?: (value: number) => void;
  smoothing?: number;
  onSmoothingChange?: (value: number) => void;
  multiplier?: number;
  onMultiplierChange?: (value: number) => void;
  acceleration?: number;
  onAccelerationChange?: (value: number) => void;
  label?: string;
}

export function IndicatorSelector({
  value,
  onChange,
  period,
  onPeriodChange,
  deviation,
  onDeviationChange,
  smoothing,
  onSmoothingChange,
  multiplier,
  onMultiplierChange,
  acceleration,
  onAccelerationChange,
  label = "Indicator"
}: IndicatorSelectorProps) {
  const selectedParams = value ? INDICATOR_PARAMS[value] : null;

  return (
    <div className="space-y-3">
      <div>
        <Label>{label}</Label>
        <Select value={value} onValueChange={(val) => onChange(getDbIndicatorName(val))}>
          <SelectTrigger>
            <SelectValue placeholder="Select indicator" />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(INDICATOR_CATEGORIES).map(([key, category]) => (
              <div key={key}>
                <div className="px-2 py-1.5 text-sm font-semibold text-muted-foreground">
                  {category.label}
                </div>
                {category.indicators.map(indicator => (
                  <SelectItem key={indicator} value={indicator}>
                    {indicator.replace(/_/g, ' ')}
                  </SelectItem>
                ))}
              </div>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedParams?.periods && onPeriodChange && (
        <div>
          <Label>Period (lookback window in candles)</Label>
          <Input
            type="number"
            value={period || 14}
            onChange={(e) => onPeriodChange(parseInt(e.target.value))}
            min={1}
            max={200}
            placeholder="e.g., 14 for RSI(14)"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Number of candles the indicator uses for calculation
          </p>
        </div>
      )}

      {selectedParams?.deviation && onDeviationChange && (
        <div>
          <Label>Standard Deviation</Label>
          <Input
            type="number"
            step="0.1"
            value={deviation || 2}
            onChange={(e) => onDeviationChange(parseFloat(e.target.value))}
            min={0.1}
            max={5}
          />
        </div>
      )}

      {selectedParams?.smoothing && onSmoothingChange && (
        <div>
          <Label>Smoothing</Label>
          <Input
            type="number"
            value={smoothing || 3}
            onChange={(e) => onSmoothingChange(parseInt(e.target.value))}
            min={1}
            max={20}
          />
        </div>
      )}

      {selectedParams?.multiplier && onMultiplierChange && (
        <div>
          <Label>Multiplier</Label>
          <Input
            type="number"
            step="0.1"
            value={multiplier || 2}
            onChange={(e) => onMultiplierChange(parseFloat(e.target.value))}
            min={0.1}
            max={10}
          />
        </div>
      )}

      {selectedParams?.acceleration && onAccelerationChange && (
        <div>
          <Label>Acceleration</Label>
          <Input
            type="number"
            step="0.01"
            value={acceleration || 0.02}
            onChange={(e) => onAccelerationChange(parseFloat(e.target.value))}
            min={0.01}
            max={0.5}
          />
        </div>
      )}
    </div>
  );
}
