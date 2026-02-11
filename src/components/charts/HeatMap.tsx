"use client";

// GitHub-style activity heat map — pure SVG
// Shows habits completed per day as colour intensity

interface HeatMapProps {
  data: { date: string; count: number; total: number }[];
  weeks?: number;
  onDayClick?: (date: string, count: number) => void;
}

const DAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function getColor(count: number, total: number): string {
  if (count === 0) return "#1a1a2e";
  const ratio = count / Math.max(total, 1);
  if (ratio <= 0.33) return "#064e3b";
  if (ratio <= 0.66) return "#059669";
  if (ratio <= 0.85) return "#10b981";
  return "#34d399";
}

export default function HeatMap({ data, weeks = 26, onDayClick }: HeatMapProps) {
  const cellSize = 12;
  const cellGap = 2;
  const totalCellSize = cellSize + cellGap;
  const leftPad = 28;
  const topPad = 16;

  // Build date → data lookup
  const dataMap = new Map<string, { count: number; total: number }>();
  for (const d of data) {
    dataMap.set(d.date, { count: d.count, total: d.total });
  }

  // Build grid: last N weeks ending today
  const today = new Date();
  const grid: { date: string; col: number; row: number; count: number; total: number }[] = [];

  // Find the start date (N weeks ago, aligned to Sunday)
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - (weeks * 7) + 1);
  // Align to previous Sunday
  startDate.setDate(startDate.getDate() - startDate.getDay());

  const d = new Date(startDate);
  let col = 0;
  let prevMonth = -1;
  const monthMarkers: { col: number; label: string }[] = [];

  while (d <= today) {
    const dateStr = d.toISOString().slice(0, 10);
    const row = d.getDay(); // 0=Sun, 6=Sat
    const entry = dataMap.get(dateStr);

    // Track month boundaries
    if (d.getMonth() !== prevMonth) {
      monthMarkers.push({ col, label: MONTH_LABELS[d.getMonth()] });
      prevMonth = d.getMonth();
    }

    grid.push({
      date: dateStr,
      col: Math.floor((d.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 7)),
      row,
      count: entry?.count ?? 0,
      total: entry?.total ?? 0,
    });

    d.setDate(d.getDate() + 1);
  }

  const totalCols = Math.ceil((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 7)) + 1;
  const svgWidth = leftPad + totalCols * totalCellSize + 4;
  const svgHeight = topPad + 7 * totalCellSize + 4;

  return (
    <div className="overflow-x-auto">
      <svg width={svgWidth} height={svgHeight} className="block">
        {/* Month labels */}
        {monthMarkers.map((m, i) => (
          <text
            key={i}
            x={leftPad + m.col * totalCellSize}
            y={10}
            fill="#666"
            fontSize="9"
            fontFamily="monospace"
          >
            {m.label}
          </text>
        ))}

        {/* Day labels */}
        {DAY_LABELS.map((label, i) => (
          label && (
            <text
              key={i}
              x={0}
              y={topPad + i * totalCellSize + cellSize - 1}
              fill="#666"
              fontSize="9"
              fontFamily="monospace"
            >
              {label}
            </text>
          )
        ))}

        {/* Cells */}
        {grid.map((cell) => (
          <rect
            key={cell.date}
            x={leftPad + cell.col * totalCellSize}
            y={topPad + cell.row * totalCellSize}
            width={cellSize}
            height={cellSize}
            rx={2}
            fill={getColor(cell.count, cell.total)}
            className="cursor-pointer transition-opacity hover:opacity-80"
            onClick={() => onDayClick?.(cell.date, cell.count)}
          >
            <title>{cell.date}: {cell.count} habits done</title>
          </rect>
        ))}
      </svg>
    </div>
  );
}
