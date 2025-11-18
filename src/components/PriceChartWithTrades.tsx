import React, { useMemo, useState, useCallback, useEffect } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Customized,
  Brush,
} from "recharts";

type Candle = {
  open_time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

type Trade = {
  type: "buy" | "sell";
  entry_time: number | string;
  exit_time?: number | string;
  entry_price: number;
  exit_price?: number;
};

type Props = {
  candles: Candle[];
  trades: Trade[];
};

function formatTs(ts: number | string) {
  const n = typeof ts === "string" ? new Date(ts).getTime() : ts;
  return new Date(n).toLocaleString();
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

function formatDateTime(ts: number) {
  return new Date(ts).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export default function PriceChartWithTrades({ candles, trades }: Props) {
  const [brushStartIndex, setBrushStartIndex] = useState<number | undefined>(undefined);
  const [brushEndIndex, setBrushEndIndex] = useState<number | undefined>(undefined);

  const data = useMemo(
    () =>
      (candles || []).map((c) => ({
        t: c.open_time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
    [candles]
  );

  // Debug: log trades received
  useEffect(() => {
    console.log('[PRICE-CHART] Received trades:', trades?.length || 0);
    if (trades && trades.length > 0) {
      console.log('[PRICE-CHART] First trade:', trades[0]);
      console.log('[PRICE-CHART] Trade keys:', Object.keys(trades[0] || {}));
    }
  }, [trades]);

  // Normalize trade times to numbers (milliseconds)
  const buyPoints = useMemo(
    () => {
      if (!trades || trades.length === 0) {
        console.log('[PRICE-CHART] No trades for buy points');
        return [];
      }
      
      const filtered = trades
        .filter((t) => {
          if (!t || !t.entry_time || t.entry_price === undefined || t.entry_price === null) {
            return false;
          }
          // Convert entry_time to number if it's a string
          const entryTime = typeof t.entry_time === "string" 
            ? new Date(t.entry_time).getTime() 
            : (t.entry_time < 1e12 ? t.entry_time * 1000 : t.entry_time); // Handle seconds vs milliseconds
          const isValid = !isNaN(entryTime) && entryTime > 0;
          if (!isValid) {
            console.warn('[PRICE-CHART] Invalid entry_time:', t.entry_time, 'for trade:', t);
          }
          return isValid;
        })
        .map((t) => {
          const entryTime = typeof t.entry_time === "string" 
            ? new Date(t.entry_time).getTime() 
            : (t.entry_time < 1e12 ? t.entry_time * 1000 : t.entry_time);
          return {
            t: entryTime,
            p: t.entry_price,
            trade: t
          };
        });
      
      console.log('[PRICE-CHART] Buy points:', filtered.length, 'from', trades.length, 'trades');
      return filtered;
    },
    [trades]
  );

  const sellPoints = useMemo(
    () => {
      const filtered = (trades || [])
        .filter((t) => {
          if (!t || !t.exit_time || t.exit_price === undefined || t.exit_price === null) {
            return false;
          }
          // Convert exit_time to number if it's a string
          const exitTime = typeof t.exit_time === "string" 
            ? new Date(t.exit_time).getTime() 
            : (t.exit_time < 1e12 ? t.exit_time * 1000 : t.exit_time); // Handle seconds vs milliseconds
          return !isNaN(exitTime) && exitTime > 0;
        })
        .map((t) => {
          const exitTime = typeof t.exit_time === "string" 
            ? new Date(t.exit_time).getTime() 
            : (t.exit_time < 1e12 ? t.exit_time * 1000 : t.exit_time);
          return {
            t: exitTime,
            p: t.exit_price as number,
            trade: t
          };
        });
      
      console.log('[PRICE-CHART] Sell points:', filtered.length);
      return filtered;
    },
    [trades]
  );

  // Filter data based on brush selection
  const filteredData = useMemo(() => {
    if (brushStartIndex === undefined || brushEndIndex === undefined) {
      return data;
    }
    return data.slice(brushStartIndex, brushEndIndex + 1);
  }, [data, brushStartIndex, brushEndIndex]);

  // Filter buy/sell points based on brush selection
  const filteredBuyPoints = useMemo(() => {
    if (!data.length || brushStartIndex === undefined || brushEndIndex === undefined) {
      return buyPoints;
    }
    const startTime = filteredData[0]?.t;
    const endTime = filteredData[filteredData.length - 1]?.t;
    if (!startTime || !endTime) return buyPoints;
    return buyPoints.filter(pt => pt.t >= startTime && pt.t <= endTime);
  }, [buyPoints, filteredData, brushStartIndex, brushEndIndex, data.length]);

  const filteredSellPoints = useMemo(() => {
    if (!data.length || brushStartIndex === undefined || brushEndIndex === undefined) {
      return sellPoints;
    }
    const startTime = filteredData[0]?.t;
    const endTime = filteredData[filteredData.length - 1]?.t;
    if (!startTime || !endTime) return sellPoints;
    return sellPoints.filter(pt => pt.t >= startTime && pt.t <= endTime);
  }, [sellPoints, filteredData, brushStartIndex, brushEndIndex, data.length]);

  const handleBrushChange = useCallback((data: any) => {
    if (data && data.startIndex !== undefined && data.endIndex !== undefined) {
      setBrushStartIndex(data.startIndex);
      setBrushEndIndex(data.endIndex);
    } else {
      setBrushStartIndex(undefined);
      setBrushEndIndex(undefined);
    }
  }, []);

  // Early return after all hooks are called
  if (!data.length) {
    return <div className="text-sm text-muted-foreground">No price data</div>;
  }

  // Calculate price range with padding
  const allPrices = data.flatMap(d => [d.high, d.low, d.open, d.close]);
  const minP = Math.min(...allPrices);
  const maxP = Math.max(...allPrices);
  const priceRange = maxP - minP;
  const pricePadding = priceRange * 0.1; // 10% padding

  // Calculate time range
  const minT = data[0].t;
  const maxT = data[data.length - 1].t;

  // Calculate domain for filtered data
  const displayMinT = filteredData[0]?.t || minT;
  const displayMaxT = filteredData[filteredData.length - 1]?.t || maxT;
  const displayMinP = Math.min(...filteredData.flatMap(d => [d.high, d.low, d.open, d.close]));
  const displayMaxP = Math.max(...filteredData.flatMap(d => [d.high, d.low, d.open, d.close]));
  const displayPriceRange = displayMaxP - displayMinP;
  const displayPricePadding = displayPriceRange * 0.1;

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={400}>
        <ComposedChart 
          data={filteredData} 
          margin={{ top: 10, right: 20, bottom: 60, left: 60 }}
        >
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis
            dataKey="t"
            type="number"
            domain={[displayMinT, displayMaxT]}
            tickFormatter={(ts) => formatDateTime(ts)}
            scale="time"
            angle={-45}
            textAnchor="end"
            height={80}
          />
          <YAxis 
            type="number" 
            domain={[displayMinP - displayPricePadding, displayMaxP + displayPricePadding]} 
            width={80}
            tickFormatter={(value) => value.toFixed(2)}
          />
          <Tooltip
            labelFormatter={(label) => formatTs(label)}
            formatter={(val: any, name: any) => {
              if (name === 'price') return [`$${val.toFixed(2)}`, 'Price'];
              return [val, name];
            }}
            contentStyle={{
              backgroundColor: 'rgba(0, 0, 0, 0.8)',
              border: '1px solid #333',
              borderRadius: '4px',
              color: '#fff'
            }}
          />

          {/* Вертикальные вспомогательные линии по входам/выходам */}
          {filteredBuyPoints.map((pt, i) => (
            <ReferenceLine 
              key={`vb-${i}`} 
              x={pt.t} 
              stroke="#22c55e" 
              strokeOpacity={0.2}
              strokeDasharray="2 2"
            />
          ))}
          {filteredSellPoints.map((pt, i) => (
            <ReferenceLine 
              key={`vs-${i}`} 
              x={pt.t} 
              stroke="#ef4444" 
              strokeOpacity={0.2}
              strokeDasharray="2 2"
            />
          ))}

          {/* Свечи и маркеры сделок, отрисованные через Customized для доступа к шкалам */}
          <Customized
            component={(props: any) => {
              const { xAxisMap, yAxisMap, offset } = props;
              const xAxis = Object.values(xAxisMap || {})[0] as any;
              const yAxis = Object.values(yAxisMap || {})[0] as any;
              if (!xAxis?.scale || !yAxis?.scale) return null;

              const y = (v: number) => yAxis.scale(v);
              const x = (ts: number) => xAxis.scale(ts);
              const barW = Math.max(2, Math.min(12, (xAxis?.bandwidth as number) || 6));

              return (
                <g>
                  {/* Свечи */}
                  {filteredData.map((d) => {
                    const isUp = d.close >= d.open;
                    const color = isUp ? "#22c55e" : "#ef4444";
                    const cx = x(d.t);
                    const highY = y(d.high);
                    const lowY = y(d.low);
                    const openY = y(d.open);
                    const closeY = y(d.close);
                    const bodyTop = Math.min(openY, closeY);
                    const bodyH = Math.max(1, Math.abs(closeY - openY));
                    const bodyX = cx - barW * 0.5;
                    const bodyW = Math.max(1, barW);
                    return (
                      <g key={d.t}>
                        <line x1={cx} x2={cx} y1={highY} y2={lowY} stroke={color} strokeWidth={1} />
                        <rect x={bodyX} y={bodyTop} width={bodyW} height={bodyH} fill={color} />
                      </g>
                    );
                  })}

                  {/* Маркеры BUY - Badge "B" */}
                  {filteredBuyPoints.length > 0 && console.log('[PRICE-CHART] Rendering', filteredBuyPoints.length, 'buy badges')}
                  {filteredBuyPoints.map((pt, i) => {
                    const cx = x(pt.t);
                    const cy = y(pt.p);
                    const badgeSize = 24;
                    // Ensure coordinates are valid
                    if (isNaN(cx) || isNaN(cy) || !isFinite(cx) || !isFinite(cy)) {
                      console.warn('[PRICE-CHART] Invalid coordinates for buy point:', pt);
                      return null;
                    }
                    return (
                      <g key={`buy-${i}-${pt.t}`}>
                        <circle
                          cx={cx}
                          cy={cy}
                          r={badgeSize / 2}
                          fill="#22c55e"
                          stroke="white"
                          strokeWidth={2}
                          opacity={0.95}
                        />
                        <text
                          x={cx}
                          y={cy}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fill="white"
                          fontSize="12"
                          fontWeight="bold"
                          pointerEvents="none"
                        >
                          B
                        </text>
                      </g>
                    );
                  })}

                  {/* Маркеры SELL - Badge "S" */}
                  {filteredSellPoints.length > 0 && console.log('[PRICE-CHART] Rendering', filteredSellPoints.length, 'sell badges')}
                  {filteredSellPoints.map((pt, i) => {
                    const cx = x(pt.t);
                    const cy = y(pt.p);
                    const badgeSize = 24;
                    // Ensure coordinates are valid
                    if (isNaN(cx) || isNaN(cy) || !isFinite(cx) || !isFinite(cy)) {
                      console.warn('[PRICE-CHART] Invalid coordinates for sell point:', pt);
                      return null;
                    }
                    return (
                      <g key={`sell-${i}-${pt.t}`}>
                        <circle
                          cx={cx}
                          cy={cy}
                          r={badgeSize / 2}
                          fill="#ef4444"
                          stroke="white"
                          strokeWidth={2}
                          opacity={0.95}
                        />
                        <text
                          x={cx}
                          y={cy}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fill="white"
                          fontSize="12"
                          fontWeight="bold"
                          pointerEvents="none"
                        >
                          S
                        </text>
                      </g>
                    );
                  })}
                </g>
              );
            }}
          />
          
          {/* Brush for zoom */}
          <Brush
            dataKey="t"
            height={30}
            stroke="#8884d8"
            fill="#8884d8"
            tickFormatter={(ts) => formatDate(ts)}
            onChange={handleBrushChange}
            startIndex={brushStartIndex}
            endIndex={brushEndIndex}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
