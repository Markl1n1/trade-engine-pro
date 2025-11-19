import React, { useMemo, useState, useCallback, useEffect, useRef } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Customized,
} from "recharts";
import { Button } from "@/components/ui/button";
import { ZoomIn, ZoomOut, Maximize2 } from "lucide-react";

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
  const [zoomDomain, setZoomDomain] = useState<{startIndex: number, endIndex: number} | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<{x: number, index: number} | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);

  // Reset zoom when candles change (new backtest results)
  useEffect(() => {
    setZoomDomain(null);
  }, [candles]);

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

  // Normalize trade times to numbers (milliseconds)
  const buyPoints = useMemo(
    () => {
      if (!trades || trades.length === 0) return [];
      
      const filtered = trades
        .filter((t) => {
          if (!t || !t.entry_time || t.entry_price === undefined || t.entry_price === null) {
            return false;
          }
          const entryTime = typeof t.entry_time === "string" 
            ? new Date(t.entry_time).getTime() 
            : (t.entry_time < 1e12 ? t.entry_time * 1000 : t.entry_time);
          return !isNaN(entryTime) && entryTime > 0;
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
          const exitTime = typeof t.exit_time === "string" 
            ? new Date(t.exit_time).getTime() 
            : (t.exit_time < 1e12 ? t.exit_time * 1000 : t.exit_time);
          return !isNaN(exitTime) && exitTime > 0;
        })
        .map((t) => {
          const exitTime = typeof t.exit_time === "string" 
            ? new Date(t.exit_time).getTime() 
            : (t.exit_time! < 1e12 ? t.exit_time! * 1000 : t.exit_time!);
          return {
            t: exitTime,
            p: t.exit_price!,
            trade: t
          };
        });
      return filtered;
    },
    [trades]
  );

  // Apply zoom domain
  const visibleData = useMemo(() => {
    if (!zoomDomain) return data;
    return data.slice(zoomDomain.startIndex, zoomDomain.endIndex + 1);
  }, [data, zoomDomain]);

  const visibleBuyPoints = useMemo(() => {
    if (!visibleData.length || !buyPoints.length) return [];
    const startTime = visibleData[0]?.t;
    const endTime = visibleData[visibleData.length - 1]?.t;
    return buyPoints.filter((pt) => pt.t >= startTime && pt.t <= endTime);
  }, [visibleData, buyPoints]);

  const visibleSellPoints = useMemo(() => {
    if (!visibleData.length || !sellPoints.length) return [];
    const startTime = visibleData[0]?.t;
    const endTime = visibleData[visibleData.length - 1]?.t;
    return sellPoints.filter((pt) => pt.t >= startTime && pt.t <= endTime);
  }, [visibleData, sellPoints]);

  // Zoom controls
  const handleZoomIn = useCallback(() => {
    const currentStart = zoomDomain?.startIndex ?? 0;
    const currentEnd = zoomDomain?.endIndex ?? data.length - 1;
    const range = currentEnd - currentStart;
    const newRange = Math.max(10, Math.floor(range * 0.7));
    const center = Math.floor((currentStart + currentEnd) / 2);
    const newStart = Math.max(0, center - Math.floor(newRange / 2));
    const newEnd = Math.min(data.length - 1, newStart + newRange);
    setZoomDomain({ startIndex: newStart, endIndex: newEnd });
  }, [data.length, zoomDomain]);

  const handleZoomOut = useCallback(() => {
    if (!zoomDomain) return;
    const currentStart = zoomDomain.startIndex;
    const currentEnd = zoomDomain.endIndex;
    const range = currentEnd - currentStart;
    const newRange = Math.min(data.length, Math.floor(range * 1.5));
    const center = Math.floor((currentStart + currentEnd) / 2);
    const newStart = Math.max(0, center - Math.floor(newRange / 2));
    const newEnd = Math.min(data.length - 1, newStart + newRange);
    
    if (newStart === 0 && newEnd === data.length - 1) {
      setZoomDomain(null);
    } else {
      setZoomDomain({ startIndex: newStart, endIndex: newEnd });
    }
  }, [data.length, zoomDomain]);

  const handleResetZoom = useCallback(() => {
    setZoomDomain(null);
  }, []);

  // Mouse wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      handleZoomIn();
    } else {
      handleZoomOut();
    }
  }, [handleZoomIn, handleZoomOut]);

  // Pan handlers
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button === 0) {
      setIsPanning(true);
      const currentStart = zoomDomain?.startIndex ?? 0;
      setPanStart({ x: e.clientX, index: currentStart });
    }
  }, [zoomDomain]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!isPanning || !panStart || !chartRef.current) return;
    
    const deltaX = e.clientX - panStart.x;
    const chartWidth = chartRef.current.offsetWidth;
    const currentStart = zoomDomain?.startIndex ?? 0;
    const currentEnd = zoomDomain?.endIndex ?? data.length - 1;
    const range = currentEnd - currentStart;
    
    const indexDelta = Math.round(-(deltaX / chartWidth) * range);
    const newStart = Math.max(0, Math.min(data.length - range - 1, panStart.index + indexDelta));
    const newEnd = newStart + range;
    
    if (newStart !== currentStart) {
      setZoomDomain({ startIndex: newStart, endIndex: newEnd });
      setPanStart({ x: e.clientX, index: newStart });
    }
  }, [isPanning, panStart, data.length, zoomDomain]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
    setPanStart(null);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsPanning(false);
    setPanStart(null);
  }, []);

  if (!data.length) {
    return (
      <div className="w-full h-[600px] flex items-center justify-center bg-card rounded-lg border border-border">
        <p className="text-muted-foreground">No price data available</p>
      </div>
    );
  }

  // Helper function to validate price values
  const isValidPrice = (price: number): boolean => {
    return !isNaN(price) && isFinite(price) && price > 0 && price < 1e10; // Reasonable upper limit
  };

  // Calculate price range with padding - filter invalid prices
  const allPrices = data.flatMap(d => [d.high, d.low, d.open, d.close])
    .filter(isValidPrice);
  
  if (allPrices.length === 0) {
    return (
      <div className="w-full h-[600px] flex items-center justify-center bg-card rounded-lg border border-border">
        <p className="text-muted-foreground">Invalid price data</p>
      </div>
    );
  }
  
  const minP = Math.min(...allPrices);
  const maxP = Math.max(...allPrices);
  const priceRange = maxP - minP;
  const pricePadding = priceRange * 0.1;

  return (
    <div 
      ref={chartRef}
      className="relative w-full h-[600px]"
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
    >
      <div className="absolute top-4 right-4 z-10 flex gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={handleZoomIn}
          className="h-8 w-8 p-0"
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={handleZoomOut}
          className="h-8 w-8 p-0"
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        {zoomDomain && (
          <Button
            size="sm"
            variant="secondary"
            onClick={handleResetZoom}
            className="h-8 w-8 p-0"
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      <ResponsiveContainer width="100%" height={600}>
        <ComposedChart
          data={visibleData}
          margin={{ top: 20, right: 30, bottom: 80, left: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis
            dataKey="t"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(val) => formatDate(val)}
            angle={-45}
            textAnchor="end"
            height={70}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          />
          <YAxis
            domain={[minP - pricePadding, maxP + pricePadding]}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "0.5rem",
            }}
            labelFormatter={(val: any) => formatDateTime(val)}
            formatter={(value: any, name: string) => {
              if (name === "high" || name === "low" || name === "open" || name === "close") {
                return [value?.toFixed(2), name];
              }
              return [value, name];
            }}
          />
          <ReferenceLine y={0} stroke="hsl(var(--border))" strokeDasharray="3 3" />
          
          <Customized
            component={(props: any) => {
              const { xAxisMap, yAxisMap } = props;
              if (!xAxisMap || !yAxisMap) return null;

              const xAxis = xAxisMap[0];
              const yAxis = yAxisMap[0];
              if (!xAxis || !yAxis) return null;

              const xScale = xAxis.scale;
              const yScale = yAxis.scale;

              return (
                <g>
                  {visibleData.map((d, i) => {
                    const x = xScale(d.t);
                    const yHigh = yScale(d.high);
                    const yLow = yScale(d.low);
                    const yOpen = yScale(d.open);
                    const yClose = yScale(d.close);

                    const isUp = d.close >= d.open;
                    const color = isUp ? "hsl(var(--success))" : "hsl(var(--destructive))";
                    const candleWidth = 6;

                    if (isNaN(x) || isNaN(yHigh) || isNaN(yLow) || isNaN(yOpen) || isNaN(yClose)) {
                      return null;
                    }

                    return (
                      <g key={`candle-${i}`}>
                        <line x1={x} y1={yHigh} x2={x} y2={yLow} stroke={color} strokeWidth={1} />
                        <rect
                          x={x - candleWidth / 2}
                          y={Math.min(yOpen, yClose)}
                          width={candleWidth}
                          height={Math.abs(yClose - yOpen) || 1}
                          fill={color}
                          stroke={color}
                          strokeWidth={1}
                        />
                      </g>
                    );
                  })}

                  {visibleBuyPoints.map((pt, idx) => {
                    const x = xScale(pt.t);
                    const y = yScale(pt.p);
                    if (isNaN(x) || isNaN(y)) return null;
                    return (
                      <g key={`buy-${idx}`}>
                        <circle cx={x} cy={y} r={8} fill="hsl(var(--success))" />
                        <text
                          x={x}
                          y={y}
                          textAnchor="middle"
                          dominantBaseline="central"
                          fontSize={10}
                          fontWeight="bold"
                          fill="hsl(var(--success-foreground))"
                        >
                          B
                        </text>
                      </g>
                    );
                  })}

                  {visibleSellPoints.map((pt, idx) => {
                    const x = xScale(pt.t);
                    const y = yScale(pt.p);
                    if (isNaN(x) || isNaN(y)) return null;
                    return (
                      <g key={`sell-${idx}`}>
                        <circle cx={x} cy={y} r={8} fill="hsl(var(--destructive))" />
                        <text
                          x={x}
                          y={y}
                          textAnchor="middle"
                          dominantBaseline="central"
                          fontSize={10}
                          fontWeight="bold"
                          fill="hsl(var(--destructive-foreground))"
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
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
