import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type IndicatorCategory = 'moving_average' | 'oscillator' | 'volume' | 'trend' | 'volatility';

export const INDICATOR_CATEGORIES: Record<IndicatorCategory, { label: string; indicators: string[] }> = {
  moving_average: {
    label: 'Moving Averages',
    indicators: ['SMA', 'EMA', 'WMA', 'KAMA', 'MAMA', 'DEMA', 'TEMA', 'WILDER_MA', 'VWMA', 'HULL_MA', 'MCGINLEY']
  },
  oscillator: {
    label: 'Oscillators',
    indicators: ['RSI', 'STOCHASTIC', 'STOCH_RSI', 'MOMENTUM', 'CCI', 'WPR', 'MFI', 'CRSI', 'TRIX', 'TSI', 'ULTIMATE_OSC', 'ROC', 'BOP', 'AWESOME_OSC', 'ACCELERATOR_OSC', 'STC', 'RMI', 'RCI', 'SMA_RSI', 'EMA_RSI', 'SMI', 'SMIE', 'CHMO', 'KDJ']
  },
  volume: {
    label: 'Volume Indicators',
    indicators: ['OBV', 'AD_LINE', 'CHAIKIN_OSC', 'CMF', 'TMF', 'MFI', 'VWAP', 'VWMA', 'DEMAND_INDEX', 'VOLUME']
  },
  trend: {
    label: 'Trend Indicators',
    indicators: ['MACD', 'ADX', 'PLUS_DI', 'MINUS_DI', 'AROON', 'PSAR', 'ICHIMOKU_TENKAN', 'ICHIMOKU_KIJUN', 'ICHIMOKU_SENKOU_A', 'ICHIMOKU_SENKOU_B', 'TII']
  },
  volatility: {
    label: 'Volatility Indicators',
    indicators: ['ATR', 'BOLLINGER_BANDS', 'BB_UPPER', 'BB_MIDDLE', 'BB_LOWER', 'KELTNER_UPPER', 'KELTNER_LOWER', 'VOLATILITY_STOP', 'FIBONACCI']
  }
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
  ATR: { periods: true },
  STOCHASTIC: { periods: true, smoothing: true },
  ADX: { periods: true },
  CCI: { periods: true },
  MFI: { periods: true },
  PSAR: { acceleration: true },
  KELTNER_UPPER: { periods: true, multiplier: true },
  KELTNER_LOWER: { periods: true, multiplier: true },
  ICHIMOKU_TENKAN: { periods: true },
  ICHIMOKU_KIJUN: { periods: true },
  DEMA: { periods: true },
  TEMA: { periods: true },
  HULL_MA: { periods: true },
  KAMA: { periods: true },
  STOCH_RSI: { periods: true },
  TSI: { periods: true },
  ULTIMATE_OSC: { periods: true },
  VWMA: { periods: true },
  VWAP: {},
  OBV: {},
  VOLUME: {},
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
        <Select value={value} onValueChange={onChange}>
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
          <Label>Period</Label>
          <Input
            type="number"
            value={period || 14}
            onChange={(e) => onPeriodChange(parseInt(e.target.value))}
            min={1}
            max={200}
          />
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
