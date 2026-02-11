"use client";

// SVG bar chart — vertical bars with labels

interface BarChartBar {
  label: string;
  value: number;
  color?: string;
}

interface BarChartProps {
  bars: BarChartBar[];
  height?: number;
  maxValue?: number;
  valueFormat?: (v: number) => string;
  barColor?: string;
}

export default function BarChart({
  bars,
  height = 180,
  maxValue: maxProp,
  valueFormat = (v) => `${Math.round(v * 100)}%`,
  barColor = "#f97316",
}: BarChartProps) {
  const pad = { top: 20, right: 8, bottom: 28, left: 8 };
  const plotH = height - pad.top - pad.bottom;
  const maxValue = maxProp ?? Math.max(...bars.map((b) => b.value), 0.01);
  const barWidth = Math.min(40, Math.max(16, 300 / bars.length));
  const barGap = Math.max(4, barWidth * 0.4);
  const totalWidth = bars.length * (barWidth + barGap) + pad.left + pad.right;

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${totalWidth} ${height}`} className="w-full" preserveAspectRatio="xMidYMid meet">
        {/* Bars */}
        {bars.map((bar, i) => {
          const x = pad.left + i * (barWidth + barGap) + barGap / 2;
          const barH = (bar.value / maxValue) * plotH;
          const y = pad.top + plotH - barH;
          const color = bar.color ?? barColor;

          return (
            <g key={i}>
              {/* Bar */}
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={Math.max(barH, 1)}
                fill={color}
                rx={3}
                className="transition-all duration-300"
              />
              {/* Value label */}
              <text
                x={x + barWidth / 2}
                y={y - 4}
                fill="#ccc"
                fontSize="9"
                textAnchor="middle"
                fontFamily="monospace"
              >
                {valueFormat(bar.value)}
              </text>
              {/* X label */}
              <text
                x={x + barWidth / 2}
                y={height - 6}
                fill="#666"
                fontSize="9"
                textAnchor="middle"
                fontFamily="monospace"
              >
                {bar.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
