import React, { useMemo } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Scatter,
  ReferenceLine,
  Customized,
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

export default function PriceChartWithTrades({ candles, trades }: Props) {
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

  const buyPoints = useMemo(
    () =>
      (trades || [])
        .filter((t) => t.entry_time && t.entry_price !== undefined)
        .map((t) => ({
          t:
            typeof t.entry_time === "string"
              ? new Date(t.entry_time).getTime()
              : (t.entry_time as number),
          p: t.entry_price,
        })),
    [trades]
  );

  const sellPoints = useMemo(
    () =>
      (trades || [])
        .filter((t) => t.exit_time && t.exit_price !== undefined)
        .map((t) => ({
          t:
            typeof t.exit_time === "string"
              ? new Date(t.exit_time).getTime()
              : (t.exit_time as number),
          p: t.exit_price as number,
        })),
    [trades]
  );

  if (!data.length) {
    return <div className="text-sm text-muted-foreground">No price data</div>;
  }

  const minT = data[0].t;
  const maxT = data[data.length - 1].t;
  const minP = Math.min(...data.map((d) => d.low));
  const maxP = Math.max(...data.map((d) => d.high));

  return (
    <ResponsiveContainer width="100%" height={320}>
      <ComposedChart data={data} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey="t"
          type="number"
          domain={[minT, maxT]}
          tickFormatter={(ts) => new Date(ts).toLocaleDateString()}
        />
        <YAxis type="number" domain={[minP, maxP]} width={60} />
        <Tooltip
          labelFormatter={(label) => formatTs(label)}
          formatter={(val: any, name: any) => [val, name]}
        />

        {/* Вертикальные вспомогательные линии по входам/выходам */}
        {buyPoints.map((pt, i) => (
          <ReferenceLine key={`vb-${i}`} x={pt.t} stroke="hsl(var(--success))" strokeOpacity={0.12} />
        ))}
        {sellPoints.map((pt, i) => (
          <ReferenceLine key={`vs-${i}`} x={pt.t} stroke="hsl(var(--destructive))" strokeOpacity={0.12} />
        ))}

        {/* Свечи, отрисованные через Customized для доступа к шкалам */}
        <Customized
          component={(props: any) => {
            const { xAxisMap, yAxisMap, offset } = props;
            const xAxis = Object.values(xAxisMap || {})[0] as any;
            const yAxis = Object.values(yAxisMap || {})[0] as any;
            if (!xAxis?.scale || !yAxis?.scale) return null;

            const y = (v: number) => yAxis.scale(v);
            const x = (ts: number) => xAxis.scale(ts);
            const barW = Math.max(3, Math.min(14, (xAxis?.bandwidth as number) || 7));

            return (
              <g>
                {data.map((d) => {
                  const isUp = d.close >= d.open;
                  const color = isUp ? "hsl(var(--success))" : "hsl(var(--destructive))";
                  const cx = x(d.t);
                  const highY = y(d.high);
                  const lowY = y(d.low);
                  const openY = y(d.open);
                  const closeY = y(d.close);
                  const bodyTop = Math.min(openY, closeY);
                  const bodyH = Math.max(1, Math.abs(closeY - openY));
                  const bodyX = cx - barW * 0.5 + barW * 0.2;
                  const bodyW = Math.max(1, barW * 0.6);
                  return (
                    <g key={d.t}>
                      <line x1={cx} x2={cx} y1={highY} y2={lowY} stroke={color} strokeWidth={1} />
                      <rect x={bodyX} y={bodyTop} width={bodyW} height={bodyH} fill={color} />
                    </g>
                  );
                })}
              </g>
            );
          }}
        />

        {/* Кастомные маркеры для BUY (зелёный треугольник вверх) */}
        <Scatter
          name="BUY"
          data={buyPoints.map((pt) => ({ ...pt, p: pt.p * 0.998 }))} // Немного ниже цены для видимости
          xKey="t"
          yKey="p"
          shape={(props: any) => {
            const { cx, cy } = props;
            const size = 12;
            return (
              <g>
                <path
                  d={`M ${cx} ${cy - size} L ${cx - size} ${cy + size} L ${cx + size} ${cy + size} Z`}
                  fill="hsl(var(--success))"
                  stroke="white"
                  strokeWidth={2}
                  opacity={0.95}
                />
              </g>
            );
          }}
        />
        {/* Кастомные маркеры для SELL (красный треугольник вниз) */}
        <Scatter
          name="SELL"
          data={sellPoints.map((pt) => ({ ...pt, p: pt.p * 1.002 }))} // Немного выше цены для видимости
          xKey="t"
          yKey="p"
          shape={(props: any) => {
            const { cx, cy } = props;
            const size = 12;
            return (
              <g>
                <path
                  d={`M ${cx} ${cy + size} L ${cx - size} ${cy - size} L ${cx + size} ${cy - size} Z`}
                  fill="hsl(var(--destructive))"
                  stroke="white"
                  strokeWidth={2}
                  opacity={0.95}
                />
              </g>
            );
          }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}


