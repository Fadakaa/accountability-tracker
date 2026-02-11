"use client";

// Multi-series SVG line chart
// Pure SVG — no external deps

interface LineChartSeries {
  label: string;
  color: string;
  data: { x: number; y: number }[];
  dashed?: boolean;
}

interface LineChartProps {
  series: LineChartSeries[];
  xLabels?: string[];
  yMin?: number;
  yMax?: number;
  height?: number;
  yFormat?: (v: number) => string;
}

export default function LineChart({
  series,
  xLabels,
  yMin = 0,
  yMax: yMaxProp,
  height = 200,
  yFormat = (v) => `${Math.round(v)}`,
}: LineChartProps) {
  const pad = { top: 12, right: 12, bottom: 28, left: 42 };
  const width = 600;
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  // Compute Y max from data if not provided
  const allY = series.flatMap((s) => s.data.map((d) => d.y));
  const yMax = yMaxProp ?? Math.max(...allY, 1);
  const yRange = yMax - yMin || 1;

  // Compute X range
  const allX = series.flatMap((s) => s.data.map((d) => d.x));
  const xMin = Math.min(...allX, 0);
  const xMax = Math.max(...allX, 1);
  const xRange = xMax - xMin || 1;

  function toSvgX(x: number): number {
    return pad.left + ((x - xMin) / xRange) * plotW;
  }
  function toSvgY(y: number): number {
    return pad.top + plotH - ((y - yMin) / yRange) * plotH;
  }

  // Y grid lines
  const yTicks = 5;
  const yGridLines = Array.from({ length: yTicks + 1 }, (_, i) => yMin + (yRange / yTicks) * i);

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" preserveAspectRatio="xMidYMid meet">
        {/* Grid lines */}
        {yGridLines.map((y, i) => (
          <g key={i}>
            <line
              x1={pad.left}
              y1={toSvgY(y)}
              x2={width - pad.right}
              y2={toSvgY(y)}
              stroke="#2a2a3e"
              strokeWidth="1"
            />
            <text
              x={pad.left - 4}
              y={toSvgY(y) + 3}
              fill="#666"
              fontSize="9"
              textAnchor="end"
              fontFamily="monospace"
            >
              {yFormat(y)}
            </text>
          </g>
        ))}

        {/* X labels */}
        {xLabels && xLabels.map((label, i) => {
          const x = toSvgX(i);
          // Only show every Nth label to avoid crowding
          const step = Math.max(1, Math.floor(xLabels.length / 8));
          if (i % step !== 0 && i !== xLabels.length - 1) return null;
          return (
            <text
              key={i}
              x={x}
              y={height - 4}
              fill="#666"
              fontSize="8"
              textAnchor="middle"
              fontFamily="monospace"
            >
              {label}
            </text>
          );
        })}

        {/* Lines */}
        {series.map((s) => {
          if (s.data.length < 2) return null;
          const pathD = s.data
            .map((d, i) => `${i === 0 ? "M" : "L"} ${toSvgX(d.x)} ${toSvgY(d.y)}`)
            .join(" ");

          return (
            <g key={s.label}>
              <path
                d={pathD}
                fill="none"
                stroke={s.color}
                strokeWidth="2"
                strokeDasharray={s.dashed ? "4 3" : undefined}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
          );
        })}

        {/* Legend */}
        {series.length > 1 && series.map((s, i) => (
          <g key={s.label}>
            <rect
              x={pad.left + i * 100}
              y={2}
              width={10}
              height={3}
              fill={s.color}
              rx={1}
            />
            <text
              x={pad.left + i * 100 + 14}
              y={6}
              fill="#999"
              fontSize="8"
              fontFamily="monospace"
            >
              {s.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
