"use client";
import { useState } from "react";
import { Area, AreaChart, XAxis, YAxis } from "recharts";
import { formatUnits, type Address } from "viem";
import { useHistory } from "@/lib/history";
import type { HistoryRange } from "@/lib/history-core";
import { alpha, timestamp } from "@/lib/format";
import { ChartContainer, ChartTooltip } from "./ui/chart";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";
import { Skeleton } from "./ui/skeleton";
import { Button } from "./ui/button";
import { QueryError } from "./ui";
export function HistoryChart({
  personal = false,
  address,
}: {
  personal?: boolean;
  address?: Address;
}) {
  const [range, setRange] = useState<HistoryRange>("All");
  const [metric, setMetric] = useState<"sharePrice" | "nav">("sharePrice");
  const history = useHistory(range, address, personal);
  const field = personal ? "positionValue" : metric;
  const title = personal
    ? "Position value"
    : metric === "sharePrice"
      ? "Value per tPF"
      : "Total pool assets";
  const data = history.data?.map((point) => ({
    time: Number(point.timestamp),
    block: point.blockNumber.toString(),
    raw: point[field],
    value: point[field] == null ? null : Number(formatUnits(point[field]!, 6)),
  }));
  const intraday =
    !!data?.length && data[data.length - 1].time - data[0].time < 86400;
  const crossDay =
    !!data?.length &&
    Math.floor(data[0].time / 86400) !==
      Math.floor(data[data.length - 1].time / 86400);
  const valid = data?.filter((point) => point.value !== null);
  return (
    <section className="history-panel">
      <div className="chart-heading">
        {personal ? (
          <h2>Position value</h2>
        ) : (
          <Tabs
            value={metric}
            onValueChange={(value) => setMetric(value as typeof metric)}
          >
            <TabsList>
              <TabsTrigger value="sharePrice">Value per tPF</TabsTrigger>
              <TabsTrigger value="nav">Total pool assets</TabsTrigger>
            </TabsList>
          </Tabs>
        )}
        <Tabs
          value={range}
          onValueChange={(value) => setRange(value as HistoryRange)}
        >
          <TabsList>
            <TabsTrigger value="1D">1D</TabsTrigger>
            <TabsTrigger value="7D">7D</TabsTrigger>
            <TabsTrigger value="All">All</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <QueryError
        error={history.error}
        label="historical data"
        retry={history.retry}
      />
      {!data ? (
        <div className="chart-loading">
          {history.error ? (
            <p>
              Historical data is unavailable. Current balances remain available.
            </p>
          ) : history.isPending && (personal ? !!address : true) ? (
            <>
              <Skeleton className="h-48 w-full" />
              <p>Reading historical on-chain snapshots…</p>
            </>
          ) : (
            <p>Connect a wallet to view your position history.</p>
          )}
        </div>
      ) : !valid?.length ? (
        <div className="chart-loading">
          <p>
            {history.hasGaps
              ? "Historical data is unavailable."
              : "History begins when shares are issued."}
          </p>
        </div>
      ) : (
        <ChartContainer
          config={{ value: { label: title, color: "#18181b" } }}
          className="history-plot"
          aria-label={`${title} history in AlphaUSD, UTC`}
        >
          <AreaChart
            accessibilityLayer
            data={data}
            margin={{ left: 8, right: 12, top: 20, bottom: 8 }}
          >
            <XAxis
              dataKey="time"
              type="number"
              domain={
                valid.length === 1
                  ? [valid[0].time - 60, valid[0].time + 60]
                  : ["dataMin", "dataMax"]
              }
              tickFormatter={(value) =>
                new Date(value * 1000).toLocaleString("en-GB", {
                  timeZone: "UTC",
                  ...(range === "1D" || intraday
                    ? {
                        hour: "2-digit",
                        minute: "2-digit",
                        ...(crossDay ? { weekday: "short" as const } : {}),
                      }
                    : { weekday: "short", day: "numeric" }),
                })
              }
              tickLine={false}
              axisLine={false}
              minTickGap={56}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={72}
              domain={
                metric === "sharePrice" && !personal
                  ? ["auto", "auto"]
                  : [0, "auto"]
              }
              tickFormatter={(value) =>
                Number(value).toLocaleString("en-GB", {
                  maximumFractionDigits:
                    metric === "sharePrice" && !personal ? 6 : 2,
                })
              }
            />
            <ChartTooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const point = payload[0].payload as NonNullable<
                  typeof data
                >[number];
                return (
                  <div className="chart-tooltip">
                    <b>{alpha(point.raw ?? undefined, 6)}</b>
                    <span>{timestamp(BigInt(point.time))}</span>
                    <span>Block {point.block}</span>
                  </div>
                );
              }}
            />
            <Area
              dataKey="value"
              type="linear"
              stroke="var(--color-value)"
              strokeWidth={2}
              fill="#18181b"
              fillOpacity={0.045}
              connectNulls={false}
              isAnimationActive={false}
              dot={valid.length < 3 ? { r: 4, fill: "#18181b" } : false}
            />
          </AreaChart>
        </ChartContainer>
      )}
      <div className="chart-footnote">
        <span>
          AlphaUSD · UTC · Actual block history
          {personal
            ? " · Includes deposits, withdrawals, transfers and valuation changes"
            : metric === "sharePrice"
              ? " · Earnings and recognized losses per share"
              : " · All investors combined"}
        </span>
        {history.hasGaps && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => void history.retry()}
          >
            Missing history · Retry
          </Button>
        )}
      </div>
      {data && (
        <details className="history-data">
          <summary>View chart data</summary>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Time · UTC</th>
                  <th>Block</th>
                  <th>{title}</th>
                </tr>
              </thead>
              <tbody>
                {data.map((point) => (
                  <tr key={point.block}>
                    <td>{timestamp(BigInt(point.time))}</td>
                    <td>{point.block}</td>
                    <td>
                      {point.raw == null ? "Unavailable" : alpha(point.raw, 6)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}
