import { Cell, Pie, PieChart, Tooltip } from 'recharts';
import { SEVERITIES, SEVERITY_COLORS, SEVERITY_LABELS } from '../lib/domain';
import { totalOf, type SeverityCounts } from '../lib/stats';

const SIZE = 196;

function percentOf(count: number, total: number): string {
  return total === 0 ? '0%' : `${Math.round((count / total) * 100)}%`;
}

export function SeverityDonut({ counts }: { counts: SeverityCounts }) {
  const total = totalOf(counts);
  const slices = SEVERITIES.filter((severity) => counts[severity] > 0).map((severity) => ({
    severity,
    name: SEVERITY_LABELS[severity],
    value: counts[severity],
  }));

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-4">
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        {total === 0 ? (
          <div className="absolute inset-[6px] rounded-full border-[30px] border-line-soft" aria-hidden />
        ) : (
          <PieChart width={SIZE} height={SIZE} aria-hidden>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="name"
              innerRadius={62}
              outerRadius={92}
              startAngle={90}
              endAngle={-270}
              stroke="#ffffff"
              strokeWidth={2}
              isAnimationActive={false}
            >
              {slices.map((slice) => (
                <Cell key={slice.severity} fill={SEVERITY_COLORS[slice.severity]} />
              ))}
            </Pie>
            <Tooltip
              wrapperStyle={{ zIndex: 10 }}
              contentStyle={{ borderRadius: 8, borderColor: '#E3E8F0', fontSize: 12 }}
              itemStyle={{ color: '#172033' }}
              formatter={(value, name) => [`${Number(value).toLocaleString('ja-JP')} 件（${percentOf(Number(value), total)}）`, String(name)]}
            />
          </PieChart>
        )}
        <div className="pointer-events-none absolute inset-0 grid place-content-center text-center">
          <span className="text-xs text-ink-soft">合計</span>
          <span className="text-2xl font-bold tabular-nums text-ink">{total.toLocaleString('ja-JP')}</span>
        </div>
      </div>
      <ul className="min-w-36 space-y-2 text-sm">
        {SEVERITIES.map((severity) => (
          <li key={severity} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: SEVERITY_COLORS[severity] }} aria-hidden />
            <span className="flex-1 whitespace-nowrap text-ink-soft">{SEVERITY_LABELS[severity]}</span>
            <span className="font-semibold tabular-nums">{counts[severity].toLocaleString('ja-JP')}</span>
            <span className="w-11 text-right text-xs tabular-nums text-ink-muted">
              {percentOf(counts[severity], total)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
