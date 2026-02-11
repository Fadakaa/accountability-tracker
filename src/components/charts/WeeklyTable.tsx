"use client";

// Styled weekly numbers table — mirrors the spreadsheet's Weekly Game

interface WeeklyTableRow {
  weekNum: number;
  startDate: string;
  endDate: string;
  metrics: {
    label: string;
    actual: number;
    target: number;
    pct: number;
  }[];
}

interface WeeklyTableProps {
  rows: WeeklyTableRow[];
  currentWeek?: number;
}

function getWeekNumber(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const diff = now.getTime() - start.getTime();
  const oneDay = 1000 * 60 * 60 * 24;
  return Math.ceil((diff / oneDay + start.getDay() + 1) / 7);
}

function pctColor(pct: number): string {
  if (pct >= 75) return "text-done";
  if (pct >= 50) return "text-later";
  return "text-missed";
}

function pctBg(pct: number): string {
  if (pct >= 75) return "bg-done/10";
  if (pct >= 50) return "bg-later/10";
  return "bg-missed/10";
}

export default function WeeklyTable({ rows, currentWeek }: WeeklyTableProps) {
  const thisWeek = currentWeek ?? getWeekNumber();

  // Only show weeks that have some data, plus surrounding context
  const relevantRows = rows.filter((r) => {
    const hasData = r.metrics.some((m) => m.actual > 0);
    const isNearCurrent = Math.abs(r.weekNum - thisWeek) <= 4;
    return hasData || isNearCurrent;
  });

  if (relevantRows.length === 0) {
    return (
      <div className="text-center text-neutral-600 text-sm py-8">
        No weekly data yet. Start logging to see your numbers.
      </div>
    );
  }

  // Get metric labels from first row
  const metricLabels = relevantRows[0]?.metrics.map((m) => m.label) ?? [];

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-neutral-500 uppercase tracking-wider">
            <th className="text-left py-2 px-2 font-bold">Wk</th>
            <th className="text-left py-2 px-2 font-bold">Dates</th>
            {metricLabels.map((label) => (
              <th key={label} className="text-center py-2 px-2 font-bold">{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {relevantRows.map((row) => {
            const isCurrent = row.weekNum === thisWeek;
            return (
              <tr
                key={row.weekNum}
                className={`border-t border-surface-700 ${
                  isCurrent ? "bg-brand/10 border-brand/30" : ""
                }`}
              >
                <td className={`py-2 px-2 font-bold ${isCurrent ? "text-brand" : "text-neutral-400"}`}>
                  {row.weekNum}
                  {isCurrent && <span className="text-[8px] ml-0.5">*</span>}
                </td>
                <td className="py-2 px-2 text-neutral-600 whitespace-nowrap">
                  {row.startDate.slice(5)} — {row.endDate.slice(5)}
                </td>
                {row.metrics.map((m) => (
                  <td key={m.label} className="py-2 px-2 text-center">
                    <div className="flex flex-col items-center">
                      <span className={`font-bold ${m.actual > 0 ? "text-white" : "text-neutral-700"}`}>
                        {m.actual}
                        <span className="text-neutral-600 font-normal">/{m.target}</span>
                      </span>
                      {m.actual > 0 && (
                        <span className={`text-[9px] font-bold ${pctColor(m.pct)}`}>
                          {m.pct}%
                        </span>
                      )}
                    </div>
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
