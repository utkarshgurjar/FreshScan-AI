import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Download } from 'lucide-react';
import type { BatchSummary, DashboardSummary } from '../types/freshscan';
import { downloadFromApi } from '../utils/downloadFile';

interface DashboardViewProps {
  summary: DashboardSummary | null;
  batches: BatchSummary[];
  loading: boolean;
  onNavigateScanner: () => void;
}

const GRADE_COLORS: Record<string, string> = {
  A: '#15803D',
  B: '#0D9488',
  C: '#D97706',
  Reject: '#DC2626',
};

export function DashboardView({
  summary,
  batches,
  loading,
  onNavigateScanner,
}: DashboardViewProps) {
  if (loading || !summary) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-64 bg-slate-200 rounded-md" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-white border border-slate-200 rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-72 bg-white border border-slate-200 rounded-xl" />
          <div className="h-72 bg-white border border-slate-200 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Quality Analytics &amp; Cold-Chain Overview
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Live inspection throughput, freshness ratios, defect distribution, and environmental gas trends across active lots.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          {batches[0] && (
            <button
              type="button"
              onClick={() =>
                downloadFromApi(
                  `/api/batches/${batches[0].id}/report?format=pdf`,
                  `${batches[0].code}-report.pdf`
                ).catch(() => {})
              }
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              Latest Batch PDF
            </button>
          )}
          <button
            type="button"
            onClick={onNavigateScanner}
            className="px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors whitespace-nowrap"
          >
            New Inspection
          </button>
        </div>
      </div>

      {/* 4-Column KPI Strip (Single Elevation, Hairline Borders, Tabular Numerals) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs font-medium text-slate-500">Total Produce Scans</div>
          <div className="text-3xl font-bold font-mono tabular-nums text-slate-900 mt-2">
            {summary.totalScans}
          </div>
          <div className="text-xs text-slate-500 mt-1.5 font-mono tabular-nums">
            {summary.freshCount} Fresh · {summary.ripeCount} Ripe · {summary.overripeCount} Overripe
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs font-medium text-slate-500">Fresh vs Rotten Ratio</div>
          <div className="text-3xl font-bold font-mono tabular-nums text-emerald-700 mt-2">
            {summary.freshVsRottenRatio}:1
          </div>
          <div className="text-xs text-slate-500 mt-1.5 font-mono tabular-nums">
            {summary.rottenCount} rejected · {summary.modelAccuracyPct}% verified accuracy
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs font-medium text-slate-500">Mean Quality Score</div>
          <div className="text-3xl font-bold font-mono tabular-nums text-slate-900 mt-2">
            {summary.averageQualityScore}
            <span className="text-base font-normal text-slate-400">/100</span>
          </div>
          <div className="text-xs text-slate-500 mt-1.5">
            Weighted vision &amp; sensor fusion average
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs font-medium text-slate-500">Active Sensor Alerts</div>
          <div
            className={`text-3xl font-bold font-mono tabular-nums mt-2 ${
              summary.activeAlertsCount > 0 ? 'text-red-700' : 'text-emerald-700'
            }`}
          >
            {summary.activeAlertsCount}
          </div>
          <div className="text-xs text-slate-500 mt-1.5">
            {summary.activeAlertsCount > 0
              ? 'Threshold breach requires review'
              : 'All storage chambers nominal'}
          </div>
        </div>
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Daily Inspection Volume</h2>
            <p className="text-xs text-slate-500">
              Scans segmented by freshness classification over recent operating days
            </p>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={summary.dailyScans}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#64748B' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#64748B' }} />
                <Tooltip
                  contentStyle={{
                    borderRadius: 8,
                    border: '1px solid #E2E8F0',
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="fresh" name="Fresh" stackId="a" fill="#15803D" radius={[0, 0, 0, 0]} />
                <Bar dataKey="ripe" name="Ripe" stackId="a" fill="#0D9488" />
                <Bar dataKey="overripe" name="Overripe" stackId="a" fill="#D97706" />
                <Bar dataKey="rotten" name="Rotten" stackId="a" fill="#DC2626" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Quality Grade Distribution</h2>
            <p className="text-xs text-slate-500">Total inspected items across USDA-style grades</p>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={summary.qualityDistribution}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                <XAxis dataKey="grade" tick={{ fontSize: 12, fill: '#64748B' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#64748B' }} />
                <Tooltip
                  contentStyle={{
                    borderRadius: 8,
                    border: '1px solid #E2E8F0',
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="count" name="Inspections" radius={[6, 6, 0, 0]}>
                  {summary.qualityDistribution.map((entry) => (
                    <Cell
                      key={entry.grade}
                      fill={GRADE_COLORS[entry.grade] ?? '#475569'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Charts Row 2: Gas/Temperature Trend + Avg Score by Item & Top Defects */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Gas &amp; Temperature Spoilage Trend
            </h2>
            <p className="text-xs text-slate-500">
              Ethylene (ppm), Ammonia (ppm), and Chamber Temperature (°C) telemetry stream
            </p>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={summary.sensorTrends}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                <XAxis dataKey="time" tick={{ fontSize: 12, fill: '#64748B' }} />
                <YAxis tick={{ fontSize: 12, fill: '#64748B' }} />
                <Tooltip
                  contentStyle={{
                    borderRadius: 8,
                    border: '1px solid #E2E8F0',
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line
                  type="monotone"
                  dataKey="ethylenePpm"
                  name="Ethylene (ppm)"
                  stroke="#D97706"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="ammoniaPpm"
                  name="Ammonia (ppm)"
                  stroke="#DC2626"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="temperatureC"
                  name="Temp (°C)"
                  stroke="#0F172A"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-5">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Average Score per Produce Type</h2>
            <div className="mt-3 divide-y divide-slate-100">
              {summary.averageByItem.map((row) => (
                <div key={row.item} className="py-2 flex items-center justify-between gap-3 text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-medium text-slate-900 truncate">{row.item}</span>
                    <span className="text-xs text-slate-400 font-mono tabular-nums">
                      ({row.scans})
                    </span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          row.avgScore >= 80
                            ? 'bg-emerald-600'
                            : row.avgScore >= 55
                              ? 'bg-amber-500'
                              : 'bg-red-600'
                        }`}
                        style={{ width: `${row.avgScore}%` }}
                      />
                    </div>
                    <span className="font-mono tabular-nums font-semibold text-slate-900 w-10 text-right">
                      {row.avgScore}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100">
            <h3 className="text-sm font-semibold text-slate-900">Top Detected Defects</h3>
            {summary.topDefects.length === 0 ? (
              <p className="text-xs text-slate-500 mt-2">No surface defects recorded yet.</p>
            ) : (
              <div className="mt-2 divide-y divide-slate-100">
                {summary.topDefects.map((d) => (
                  <div key={d.type} className="py-2 flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-800 capitalize">{d.type}</span>
                    <div className="flex items-center gap-3 font-mono tabular-nums">
                      <span
                        className={
                          d.avgSeverity === 'Severe'
                            ? 'text-red-700 font-semibold'
                            : d.avgSeverity === 'Moderate'
                              ? 'text-amber-700 font-semibold'
                              : 'text-slate-600'
                        }
                      >
                        {d.avgSeverity}
                      </span>
                      <span className="text-slate-500">{d.count} hits</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
