"use client";

// SVG donut/ring chart using stroke-dasharray

interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  segments: DonutSegment[];
  size?: number;
  strokeWidth?: number;
  centerLabel?: string;
  centerValue?: string;
}

export default function DonutChart({
  segments,
  size = 160,
  strokeWidth = 20,
  centerLabel,
  centerValue,
}: DonutChartProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const center = size / 2;

  // Build arc offsets
  let accumulated = 0;
  const arcs = segments.map((seg) => {
    const pct = total > 0 ? seg.value / total : 0;
    const dashLength = pct * circumference;
    const offset = circumference - accumulated * circumference / total;
    const result = {
      ...seg,
      dashArray: `${dashLength} ${circumference - dashLength}`,
      dashOffset: -accumulated * circumference / (total || 1),
      pct: Math.round(pct * 100),
    };
    accumulated += seg.value;
    return result;
  });

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          {/* Background ring */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="#1a1a2e"
            strokeWidth={strokeWidth}
          />
          {/* Segments */}
          {arcs.map((arc, i) => (
            <circle
              key={i}
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={arc.color}
              strokeWidth={strokeWidth}
              strokeDasharray={arc.dashArray}
              strokeDashoffset={arc.dashOffset}
              strokeLinecap="round"
              className="transition-all duration-500"
            />
          ))}
        </svg>
        {/* Center text */}
        {(centerLabel || centerValue) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {centerValue && <span className="text-lg font-bold text-white">{centerValue}</span>}
            {centerLabel && <span className="text-[10px] text-neutral-500">{centerLabel}</span>}
          </div>
        )}
      </div>
      {/* Legend */}
      <div className="flex flex-wrap justify-center gap-3">
        {arcs.map((arc, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: arc.color }} />
            <span className="text-[10px] text-neutral-400">
              {arc.label} ({arc.pct}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
